import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, RoleName, UserStatus } from '@prisma/client';
import { ApiError } from '../common/errors';
import { randomToken, sha256 } from '../common/crypto/password.service';
import { PrismaService } from '../prisma/prisma.service';

const userWithRoles = {
  roles: { include: { role: true } },
} satisfies Prisma.UserInclude;

export type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userWithRoles }>;

export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

@Injectable()
export class TokenService {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessTtlSeconds = config.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS');
    this.refreshTtlMs = config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') * 24 * 60 * 60 * 1000;
  }

  async issue(user: UserWithRoles): Promise<IssuedSession> {
    const refreshToken = randomToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      accessToken: await this.signAccess(user),
      refreshToken,
      expiresIn: this.accessTtlSeconds,
    };
  }

  async rotate(rawToken: string): Promise<IssuedSession> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: { include: userWithRoles } },
    });
    if (!existing) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Sign in again.');
    }
    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId, existing.userId);
      throw new ApiError(401, 'REFRESH_REUSE', 'Session ended. Sign in again.');
    }
    if (existing.expiresAt.getTime() <= Date.now() || existing.user.status !== UserStatus.active) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Sign in again.');
    }

    const refreshToken = randomToken();
    const rotated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (claimed.count !== 1) return false;
      await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: sha256(refreshToken),
          familyId: existing.familyId,
          expiresAt: new Date(Date.now() + this.refreshTtlMs),
        },
      });
      return true;
    });

    if (!rotated) {
      await this.revokeFamily(existing.familyId, existing.userId);
      throw new ApiError(401, 'REFRESH_REUSE', 'Session ended. Sign in again.');
    }

    return {
      accessToken: await this.signAccess(existing.user),
      refreshToken,
      expiresIn: this.accessTtlSeconds,
    };
  }

  async revoke(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  }

  private signAccess(user: UserWithRoles) {
    return this.jwt.signAsync({
      sub: user.id,
      roles: user.roles.map((entry) => entry.role.name as RoleName),
      tv: user.tokenVersion,
      purpose: 'access',
    });
  }
}
