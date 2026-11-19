import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { PasswordService } from '../common/crypto/password.service';
import { Mailer } from '../mail/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { EmailCodeService } from './email-code.service';
import { MfaService } from './mfa.service';
import { OauthService } from './oauth.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  const tokens = { issue: jest.fn(), rotate: jest.fn(), revoke: jest.fn(), revokeAllForUser: jest.fn() };
  const mfa = { enroll: jest.fn(), confirm: jest.fn(), verify: jest.fn() };
  const passwords = { hash: jest.fn(async () => 'hash'), matches: jest.fn() };
  const mailer = { sendCode: jest.fn() };
  const codes = { issue: jest.fn(async () => '123456'), check: jest.fn() };
  const config = { getOrThrow: () => 300 } as unknown as ConfigService;

  function user(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      email: 'collector@example.com',
      passwordHash: 'hash',
      emailVerifiedAt: null,
      status: UserStatus.active,
      tokenVersion: 0,
      roles: [{ role: { name: 'collector' } }],
      mfaFactors: [],
      ...overrides,
    };
  }

  function service(prisma: unknown) {
    return new AuthService(
      prisma as PrismaService,
      passwords as unknown as PasswordService,
      tokens as unknown as TokenService,
      mfa as unknown as MfaService,
      {} as OauthService,
      new JwtService({ secret: 'test-secret-test-secret-test-secret' }),
      mailer as unknown as Mailer,
      config,
      codes as unknown as EmailCodeService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not open a session when multi-factor authentication is enabled', async () => {
    passwords.matches.mockResolvedValue(true);
    const prisma = {
      user: {
        findUnique: async () =>
          user({ mfaFactors: [{ confirmedAt: new Date(), disabledAt: null }] }),
      },
    };
    const result = await service(prisma).login('collector@example.com', 'Correct-Horse-1');
    expect(result).toMatchObject({ mfaRequired: true });
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('rejects an unknown email without sending a reset message', async () => {
    const prisma = { user: { findUnique: async () => null } };
    await service(prisma).forgotPassword('missing@example.com');
    expect(mailer.sendCode).not.toHaveBeenCalled();
    expect(codes.issue).not.toHaveBeenCalled();
  });

  it('emails a reset code to an existing account', async () => {
    const prisma = { user: { findUnique: async () => user() } };
    const code = await service(prisma).forgotPassword('collector@example.com');
    expect(code).toBe('123456');
    expect(mailer.sendCode).toHaveBeenCalledWith('collector@example.com', 'password_reset', '123456');
  });

  it('reports a duplicate email instead of creating a second account', async () => {
    const prisma = {
      $transaction: async () => {
        const error = new Error('unique') as Error & { code: string };
        error.code = 'P2002';
        throw error;
      },
    };
    await expect(service(prisma).register('collector@example.com', 'Correct-Horse-1')).rejects.toMatchObject({
      code: 'EMAIL_IN_USE',
    });
  });
});
