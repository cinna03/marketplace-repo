import { randomBytes, randomUUID } from 'crypto';
import { FieldCipher } from '../common/crypto/field-cipher';
import { sha256 } from '../common/crypto/password.service';
import { PrismaService } from '../prisma/prisma.service';
import { MfaService } from './mfa.service';

type Factor = {
  id: string;
  userId: string;
  type: 'totp';
  secretCiphertext: string;
  confirmedAt: Date | null;
  disabledAt: Date | null;
  lastAcceptedStep: number | null;
  createdAt: Date;
};

type Recovery = { id: string; factorId: string; codeHash: string; usedAt: Date | null };

describe('MfaService', () => {
  function setup() {
    const factors: Factor[] = [];
    const codes: Recovery[] = [];
    const cipher = new FieldCipher(randomBytes(32));

    const matches = (factor: Factor, where: Record<string, unknown>) => {
      if (where.id && factor.id !== where.id) return false;
      if (where.userId && factor.userId !== where.userId) return false;
      if ('confirmedAt' in where) {
        const confirmed = where.confirmedAt as { not: null } | null;
        if (confirmed === null && factor.confirmedAt !== null) return false;
        if (confirmed && typeof confirmed === 'object' && 'not' in confirmed && factor.confirmedAt === null) return false;
      }
      if ('disabledAt' in where && where.disabledAt === null && factor.disabledAt !== null) return false;
      if (where.OR && Array.isArray(where.OR)) {
        const or = where.OR as Array<{ lastAcceptedStep: null | { lt: number } }>;
        const ok = or.some((clause) => {
          if (clause.lastAcceptedStep === null) return factor.lastAcceptedStep === null;
          return factor.lastAcceptedStep !== null && factor.lastAcceptedStep < clause.lastAcceptedStep.lt;
        });
        if (!ok) return false;
      }
      return true;
    };

    const api = {
      mfaFactor: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          factors.find((factor) => matches(factor, where)) ?? null,
        deleteMany: async ({ where }: { where: { userId: string; confirmedAt: null } }) => {
          for (let index = factors.length - 1; index >= 0; index -= 1) {
            if (factors[index].userId === where.userId && factors[index].confirmedAt === null) factors.splice(index, 1);
          }
        },
        create: async ({
          data,
        }: {
          data: {
            userId: string;
            type: 'totp';
            secretCiphertext: string;
            recoveryCodes: { create: Array<{ codeHash: string }> };
          };
        }) => {
          const factor: Factor = {
            id: randomUUID(),
            userId: data.userId,
            type: 'totp',
            secretCiphertext: data.secretCiphertext,
            confirmedAt: null,
            disabledAt: null,
            lastAcceptedStep: null,
            createdAt: new Date(),
          };
          factors.push(factor);
          for (const code of data.recoveryCodes.create) {
            codes.push({ id: randomUUID(), factorId: factor.id, codeHash: code.codeHash, usedAt: null });
          }
          return factor;
        },
        update: async ({ where, data }: { where: { id: string }; data: { confirmedAt: Date } }) => {
          const factor = factors.find((item) => item.id === where.id)!;
          factor.confirmedAt = data.confirmedAt;
          return factor;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: { lastAcceptedStep: number };
        }) => {
          let count = 0;
          for (const factor of factors) {
            if (!matches(factor, where)) continue;
            factor.lastAcceptedStep = data.lastAcceptedStep;
            count += 1;
          }
          return { count };
        },
      },
      mfaRecoveryCode: {
        updateMany: async ({
          where,
          data,
        }: {
          where: { factorId: string; codeHash: string; usedAt: null };
          data: { usedAt: Date };
        }) => {
          let count = 0;
          for (const code of codes) {
            if (code.factorId === where.factorId && code.codeHash === where.codeHash && code.usedAt === null) {
              code.usedAt = data.usedAt;
              count += 1;
            }
          }
          return { count };
        },
      },
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(api),
    };

    return {
      service: new MfaService(api as unknown as PrismaService, cipher),
      factors,
      codes,
      userId: randomUUID(),
    };
  }

  it('confirms a factor with the current code and rejects that same code', async () => {
    const { service, userId, factors } = setup();
    const enrollment = await service.enroll(userId, 'artist@example.com');
    const code = service.currentCode(enrollment.secret);
    await service.confirm(userId, code);
    expect(factors[0].confirmedAt).toBeInstanceOf(Date);
    await expect(service.verify(userId, code)).resolves.toBe(false);
  });

  it('consumes a recovery code once', async () => {
    const { service, userId } = setup();
    const enrollment = await service.enroll(userId, 'artist@example.com');
    await service.confirm(userId, service.currentCode(enrollment.secret));
    const recovery = enrollment.recoveryCodes[0];
    await expect(service.verify(userId, recovery.toLowerCase())).resolves.toBe(true);
    await expect(service.verify(userId, recovery)).resolves.toBe(false);
    expect(sha256(recovery)).toEqual(expect.any(String));
  });

  it('refuses a second enrollment after confirmation', async () => {
    const { service, userId } = setup();
    const enrollment = await service.enroll(userId, 'artist@example.com');
    await service.confirm(userId, service.currentCode(enrollment.secret));
    await expect(service.enroll(userId, 'artist@example.com')).rejects.toMatchObject({ code: 'MFA_ALREADY_ENABLED' });
  });
});
