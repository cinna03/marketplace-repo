import { randomInt } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OauthProvider, Prisma, UserStatus } from '@prisma/client';
import { ApiError, isUniqueViolation } from '../common/errors';
import { PasswordService, sha256 } from '../common/crypto/password.service';
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
      const session = await this.finishSignIn(user);
      // The confirm page sends the code and shows its own status. Waiting here holds the button.
      void this.sendVerifyCode(user.id, user.email).catch(() => undefined);
      return session;
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

  async sendVerifyCode(userId: string, email: string): Promise<void> {
    await this.issueCode(userId, email, 'verify', 'Your Cinnarios code', (code) =>
      `Your Cinnarios confirmation code is ${code}. It expires in 15 minutes. If you did not create an account, ignore this email.`,
    );
  }

  async confirmEmail(userId: string, code: string): Promise<void> {
    await this.consumeCode(userId, 'verify', code);
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== UserStatus.active) return;
    await this.issueCode(user.id, user.email, 'reset', 'Reset your Cinnarios password', (code) =>
      `Your Cinnarios password reset code is ${code}. It expires in 15 minutes. If you did not ask for this, ignore this email.`,
    );
  }

  async checkResetCode(email: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== UserStatus.active) {
      throw new ApiError(400, 'RESET_CODE_INVALID', 'That code is not valid.');
    }
    const row = await this.findLiveCode(user.id, 'reset', code);
    if (!row) throw new ApiError(400, 'RESET_CODE_INVALID', 'That code is not valid.');
  }

  async changePassword(userId: string, currentPassword: string, password: string, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      throw new ApiError(400, 'PASSWORD_UNAVAILABLE', 'This account signs in another way, so there is no password to change.');
    }
    const matches = await this.passwords.matches(user.passwordHash, currentPassword);
    if (!matches) {
      throw new ApiError(401, 'PASSWORD_INCORRECT', 'The current password is incorrect.');
    }
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await this.tokens.revokeAllForUser(userId, tx);
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.password_change',
          entityType: 'user',
          entityId: userId,
          ip,
        },
      });
    });
  }

  async resetPassword(email: string, code: string, password: string, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== UserStatus.active) {
      throw new ApiError(400, 'RESET_CODE_INVALID', 'That code is not valid.');
    }
    const reset = await this.findLiveCode(user.id, 'reset', code);
    if (!reset) throw new ApiError(400, 'RESET_CODE_INVALID', 'That code is not valid.');

    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.emailCode.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ApiError(400, 'RESET_CODE_INVALID', 'That code is not valid.');
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await this.tokens.revokeAllForUser(user.id, tx);
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'auth.password_reset', entityType: 'user', entityId: user.id, ip },
      });
    });
  }

  private async issueCode(userId: string, email: string, purpose: string, subject: string, body: (code: string) => string) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.emailCode.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.emailCode.create({
      data: {
        userId,
        purpose,
        codeHash: sha256(`${purpose}:${userId}:${code}`),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    await this.mailer.send(email, subject, body(code));
  }

  private findLiveCode(userId: string, purpose: string, code: string) {
    return this.prisma.emailCode.findFirst({
      where: {
        userId,
        purpose,
        codeHash: sha256(`${purpose}:${userId}:${code}`),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  private async consumeCode(userId: string, purpose: string, code: string) {
    const row = await this.findLiveCode(userId, purpose, code);
    if (!row) throw new ApiError(400, 'CODE_INVALID', 'That code is not valid.');
    const claimed = await this.prisma.emailCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new ApiError(400, 'CODE_INVALID', 'That code is not valid.');
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
