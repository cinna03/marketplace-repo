import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OauthProvider, Prisma, UserStatus } from '@prisma/client';
import { ApiError, isUniqueViolation } from '../common/errors';
import { PasswordService, randomToken, sha256 } from '../common/crypto/password.service';
import { Mailer } from '../mail/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { MfaService } from './mfa.service';
import { OauthProfile } from './oauth-claims';
import { OauthService } from './oauth.service';
import { displayNameFromEmail } from '../profiles/display-name';
import { IssuedSession, TokenService } from './token.service';

const userAuthInclude = {
  roles: { include: { role: true } },
  mfaFactors: true,
} satisfies Prisma.UserInclude;

type AuthUser = Prisma.UserGetPayload<{ include: typeof userAuthInclude }>;

export type PublicSession = {
  accessToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: {
    id: string;
    email: string;
    roles: string[];
    emailVerifiedAt: Date | null;
    mfaEnabled: boolean;
  };
};

type SessionResult =
  | (IssuedSession & { user: PublicSession['user'] })
  | { mfaRequired: true; mfaToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly mfa: MfaService,
    private readonly oauth: OauthService,
    private readonly jwt: JwtService,
    private readonly mailer: Mailer,
    private readonly config: ConfigService,
  ) {}

  async register(email: string, password: string, ip?: string): Promise<SessionResult> {
    const passwordHash = await this.passwords.hash(password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        await tx.role.upsert({
          where: { name: 'collector' },
          update: {},
          create: { name: 'collector' },
        });
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            roles: { create: { role: { connect: { name: 'collector' } } } },
            collectorProfile: { create: { displayName: displayNameFromEmail(email) } },
          },
          include: userAuthInclude,
        });
        await tx.auditLog.create({
          data: {
            actorId: created.id,
            action: 'auth.register',
            entityType: 'user',
            entityId: created.id,
            ip,
          },
        });
        return created;
      });
      return this.finishSignIn(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
      }
      throw error;
    }
  }

  async login(email: string, password: string): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({ where: { email }, include: userAuthInclude });
    const passwordOk = await this.passwords.matches(user?.passwordHash ?? null, password);
    if (!user || !passwordOk) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    this.assertActive(user.status);
    return this.finishSignIn(user);
  }

  async refresh(rawToken: string): Promise<IssuedSession> {
    return this.tokens.rotate(rawToken);
  }

  async logout(rawToken?: string): Promise<void> {
    if (rawToken) await this.tokens.revoke(rawToken);
  }

  async signInWithProvider(provider: OauthProvider, idToken: string): Promise<SessionResult> {
    const profile = await this.oauth.verify(provider, idToken);
    const user = await this.linkOauth(profile);
    this.assertActive(user.status);
    return this.finishSignIn(user);
  }

  async enrollMfa(userId: string, email: string) {
    return this.mfa.enroll(userId, email);
  }

  async confirmMfa(userId: string, code: string, ip?: string) {
    await this.mfa.confirm(userId, code);
    await this.prisma.auditLog.create({
      data: { actorId: userId, action: 'auth.mfa_confirmed', entityType: 'user', entityId: userId, ip },
    });
  }

  async challengeMfa(mfaToken: string, code: string): Promise<IssuedSession & { user: PublicSession['user'] }> {
    let payload: { sub?: string; purpose?: string; tv?: number };
    try {
      payload = await this.jwt.verifyAsync(mfaToken);
    } catch {
      throw new ApiError(401, 'MFA_INVALID', 'That authentication code is not valid.');
    }
    if (payload.purpose !== 'mfa' || !payload.sub || typeof payload.tv !== 'number') {
      throw new ApiError(401, 'MFA_INVALID', 'That authentication code is not valid.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: userAuthInclude });
    if (!user || user.tokenVersion !== payload.tv) {
      throw new ApiError(401, 'MFA_INVALID', 'That authentication code is not valid.');
    }
    this.assertActive(user.status);
    const verified = await this.mfa.verify(user.id, code);
    if (!verified) {
      throw new ApiError(401, 'MFA_INVALID', 'That authentication code is not valid.');
    }
    const session = await this.tokens.issue(user);
    return { ...session, user: this.publicUser(user) };
  }

  async forgotPassword(email: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== UserStatus.active) return null;

    const raw = randomToken();
    const tokenHash = sha256(raw);
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
    });

    const url = new URL('/reset-password', this.config.getOrThrow<string>('APP_WEB_URL'));
    url.searchParams.set('token', raw);
    await this.mailer.sendPasswordReset(user.email, url.toString());
    return url.toString();
  }

  async resetPassword(token: string, password: string, ip?: string): Promise<void> {
    const tokenHash = sha256(token);
    const reset = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(400, 'RESET_TOKEN_INVALID', 'This reset link is invalid or has expired.');
    }

    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ApiError(400, 'RESET_TOKEN_INVALID', 'This reset link is invalid or has expired.');
      }
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await this.tokens.revokeAllForUser(reset.userId, tx);
      await tx.auditLog.create({
        data: {
          actorId: reset.userId,
          action: 'auth.password_reset',
          entityType: 'user',
          entityId: reset.userId,
          ip,
        },
      });
    });
  }

  private async finishSignIn(user: AuthUser): Promise<SessionResult> {
    const mfaEnabled = user.mfaFactors.some((factor) => factor.confirmedAt && !factor.disabledAt);
    if (mfaEnabled) {
      const mfaToken = await this.jwt.signAsync(
        { sub: user.id, purpose: 'mfa', tv: user.tokenVersion },
        { expiresIn: this.config.getOrThrow<number>('MFA_CHALLENGE_TTL_SECONDS') },
      );
      return { mfaRequired: true, mfaToken };
    }
    const session = await this.tokens.issue(user);
    return { ...session, user: this.publicUser(user) };
  }

  private async linkOauth(profile: OauthProfile): Promise<AuthUser> {
    const linked = await this.prisma.oauthAccount.findUnique({
      where: { provider_providerUserId: { provider: profile.provider, providerUserId: profile.providerUserId } },
      include: { user: { include: userAuthInclude } },
    });
    if (linked) return linked.user;

    const existing = await this.prisma.user.findUnique({
      where: { email: profile.email },
      include: userAuthInclude,
    });
    if (existing) {
      await this.prisma.oauthAccount.create({
        data: { userId: existing.id, provider: profile.provider, providerUserId: profile.providerUserId },
      });
      if (!existing.emailVerifiedAt) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { emailVerifiedAt: new Date() },
        });
        existing.emailVerifiedAt = new Date();
      }
      return existing;
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.role.upsert({ where: { name: 'collector' }, update: {}, create: { name: 'collector' } });
      return tx.user.create({
        data: {
          email: profile.email,
          emailVerifiedAt: new Date(),
          roles: { create: { role: { connect: { name: 'collector' } } } },
          collectorProfile: { create: { displayName: displayNameFromEmail(profile.email) } },
          oauthAccounts: {
            create: { provider: profile.provider, providerUserId: profile.providerUserId },
          },
        },
        include: userAuthInclude,
      });
    });
  }

  private publicUser(user: AuthUser): PublicSession['user'] {
    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map((entry) => entry.role.name),
      emailVerifiedAt: user.emailVerifiedAt,
      mfaEnabled: user.mfaFactors.some((factor) => factor.confirmedAt && !factor.disabledAt),
    };
  }

  private assertActive(status: UserStatus) {
    if (status !== UserStatus.active) {
      throw new ApiError(403, 'ACCOUNT_UNAVAILABLE', 'This account cannot sign in.');
    }
  }
}

export function toPublicSession(result: IssuedSession & { user: PublicSession['user'] }): PublicSession {
  return {
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    tokenType: 'Bearer',
    user: result.user,
  };
}
