import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName, UserStatus } from '@prisma/client';
import { JWT_AUDIENCE, JWT_ISSUER } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService, UserWithRoles } from './token.service';

type StoredToken = {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

describe('TokenService', () => {
  function setup() {
    const user = {
      id: randomUUID(),
      email: 'collector@example.com',
      passwordHash: null,
      emailVerifiedAt: null,
      phoneCiphertext: null,
      status: UserStatus.active,
      tokenVersion: 0,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      roles: [
        {
          userId: '',
          roleId: 'role-1',
          grantedAt: new Date(),
          grantedBy: null,
          role: { id: 'role-1', name: RoleName.collector },
        },
      ],
    } as unknown as UserWithRoles;
    user.roles[0].userId = user.id;

    const tokens: StoredToken[] = [];
    const state = { tokenVersion: 0 };

    const api = {
      user: {
        update: async ({ data }: { data: { tokenVersion?: { increment: number }; lastLoginAt?: Date } }) => {
          if (data.tokenVersion?.increment) state.tokenVersion += data.tokenVersion.increment;
          user.tokenVersion = state.tokenVersion;
          return user;
        },
      },
      refreshToken: {
        create: async ({ data }: { data: Omit<StoredToken, 'id' | 'revokedAt'> }) => {
          const row: StoredToken = { id: randomUUID(), revokedAt: null, ...data };
          tokens.push(row);
          return row;
        },
        findUnique: async ({ where }: { where: { tokenHash: string } }) => {
          const row = tokens.find((token) => token.tokenHash === where.tokenHash);
          if (!row) return null;
          return { ...row, user: { ...user, tokenVersion: state.tokenVersion, status: UserStatus.active } };
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { id?: string; familyId?: string; userId?: string; tokenHash?: string; revokedAt: null };
          data: { revokedAt: Date };
        }) => {
          let count = 0;
          for (const token of tokens) {
            const matches =
              token.revokedAt === null &&
              (where.id === undefined || token.id === where.id) &&
              (where.familyId === undefined || token.familyId === where.familyId) &&
              (where.userId === undefined || token.userId === where.userId) &&
              (where.tokenHash === undefined || token.tokenHash === where.tokenHash);
            if (matches) {
              token.revokedAt = data.revokedAt;
              count += 1;
            }
          }
          return { count };
        },
      },
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(api),
    };

    const jwt = new JwtService({
      secret: 'test-secret-test-secret-test-secret',
      signOptions: { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: 900 },
    });
    const config = {
      getOrThrow: (key: string) => (key === 'ACCESS_TOKEN_TTL_SECONDS' ? 900 : 30),
    } as ConfigService;
    return {
      service: new TokenService(api as unknown as PrismaService, jwt, config),
      tokens,
      state,
      user,
    };
  }

  it('rotates a refresh token and rejects the previous token as reuse', async () => {
    const { service, tokens, state, user } = setup();
    const issued = await service.issue(user);
    const rotated = await service.rotate(issued.refreshToken);

    expect(rotated.accessToken).toEqual(expect.any(String));
    expect(rotated.refreshToken).not.toBe(issued.refreshToken);
    await expect(service.rotate(issued.refreshToken)).rejects.toMatchObject({ code: 'REFRESH_REUSE' });
    expect(state.tokenVersion).toBe(1);
    expect(tokens.filter((token) => token.revokedAt === null)).toHaveLength(0);
  });

  it('rejects an unknown refresh token', async () => {
    const { service } = setup();
    await expect(service.rotate('not-a-real-refresh-token-value')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
