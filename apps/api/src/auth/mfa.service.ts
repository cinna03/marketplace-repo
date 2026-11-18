import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Secret, TOTP } from 'otpauth';
import { ApiError } from '../common/errors';
import { FieldCipher } from '../common/crypto/field-cipher';
import { sha256 } from '../common/crypto/password.service';
import { PrismaService } from '../prisma/prisma.service';

const ISSUER = 'Marketplace';
const PERIOD = 30;

export type MfaEnrollment = {
  factorId: string;
  otpauthUrl: string;
  secret: string;
  recoveryCodes: string[];
};

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {}

  async enroll(userId: string, email: string): Promise<MfaEnrollment> {
    const confirmed = await this.prisma.mfaFactor.findFirst({
      where: { userId, confirmedAt: { not: null }, disabledAt: null },
    });
    if (confirmed) {
      throw new ApiError(409, 'MFA_ALREADY_ENABLED', 'Multi-factor authentication is already enabled.');
    }

    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: ISSUER,
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: PERIOD,
      secret,
    });
    const recoveryCodes = Array.from({ length: 10 }, () => this.recoveryCode());

    const factor = await this.prisma.$transaction(async (tx) => {
      await tx.mfaFactor.deleteMany({ where: { userId, confirmedAt: null } });
      return tx.mfaFactor.create({
        data: {
          userId,
          type: 'totp',
          secretCiphertext: this.cipher.encrypt(secret.base32),
          recoveryCodes: {
            create: recoveryCodes.map((code) => ({ codeHash: sha256(code) })),
          },
        },
      });
    });

    return {
      factorId: factor.id,
      otpauthUrl: totp.toString(),
      secret: secret.base32,
      recoveryCodes,
    };
  }

  async confirm(userId: string, code: string): Promise<void> {
    const factor = await this.prisma.mfaFactor.findFirst({
      where: { userId, confirmedAt: null, disabledAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!factor || !(await this.acceptTotp(factor, code))) {
      throw new ApiError(401, 'MFA_INVALID', 'That authentication code is not valid.');
    }
    await this.prisma.mfaFactor.update({
      where: { id: factor.id },
      data: { confirmedAt: new Date() },
    });
  }

  async verify(userId: string, code: string): Promise<boolean> {
    const factor = await this.prisma.mfaFactor.findFirst({
      where: { userId, confirmedAt: { not: null }, disabledAt: null },
      orderBy: { confirmedAt: 'desc' },
    });
    if (!factor) return false;

    const normalized = code.trim().replace(/\s+/g, '').toUpperCase();
    if (/^\d{6}$/.test(normalized)) {
      return this.acceptTotp(factor, normalized);
    }
    const consumed = await this.prisma.mfaRecoveryCode.updateMany({
      where: { factorId: factor.id, codeHash: sha256(normalized), usedAt: null },
      data: { usedAt: new Date() },
    });
    return consumed.count === 1;
  }

  currentCode(secretBase32: string, at = new Date()): string {
    return this.totp(secretBase32).generate({ timestamp: at.getTime() });
  }

  private async acceptTotp(
    factor: { id: string; secretCiphertext: string; lastAcceptedStep: number | null },
    code: string,
  ): Promise<boolean> {
    const step = this.stepFor(this.cipher.decrypt(factor.secretCiphertext), code);
    if (step === null) return false;
    const accepted = await this.prisma.mfaFactor.updateMany({
      where: {
        id: factor.id,
        OR: [{ lastAcceptedStep: null }, { lastAcceptedStep: { lt: step } }],
      },
      data: { lastAcceptedStep: step },
    });
    return accepted.count === 1;
  }

  private stepFor(secretBase32: string, code: string, at = new Date()): number | null {
    const delta = this.totp(secretBase32).validate({ token: code, timestamp: at.getTime(), window: 1 });
    if (delta === null) return null;
    return Math.floor(at.getTime() / 1000 / PERIOD) + delta;
  }

  private totp(secretBase32: string): TOTP {
    return new TOTP({
      issuer: ISSUER,
      algorithm: 'SHA1',
      digits: 6,
      period: PERIOD,
      secret: Secret.fromBase32(secretBase32),
    });
  }

  private recoveryCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = () =>
      Array.from(randomBytes(4), (byte) => alphabet[byte % alphabet.length]).join('');
    return `${part()}-${part()}`;
  }
}

export type MfaFactorRecord = Prisma.MfaFactorGetPayload<Record<string, never>>;
