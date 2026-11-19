import { Injectable } from '@nestjs/common';
import { EmailCodePurpose, Prisma } from '@prisma/client';
import { randomInt, timingSafeEqual } from 'crypto';
import { ApiError } from '../common/errors';
import { sha256 } from '../common/crypto/password.service';
import { PrismaService } from '../prisma/prisma.service';

const LIFETIME_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Client = PrismaService | Prisma.TransactionClient;

/**
 * Six-digit codes sent by email, for resetting a password or confirming an address.
 * Only a hash is kept. A new code replaces any earlier one for the same purpose, a code
 * lasts 15 minutes, and five wrong tries use it up, so guessing is not practical.
 */
@Injectable()
export class EmailCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(userId: string, purpose: EmailCodePurpose): Promise<string> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction(async (tx) => {
      await tx.emailCode.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
      await tx.emailCode.create({
        data: { userId, purpose, codeHash: sha256(code), expiresAt: new Date(Date.now() + LIFETIME_MS) },
      });
    });
    return code;
  }

  /**
   * Throws unless `code` is the live code for this user and purpose. A wrong code counts
   * as one attempt. With `consume`, a right code is used up so it cannot be replayed.
   */
  async check(userId: string, purpose: EmailCodePurpose, code: string, options: { consume?: boolean; client?: Client } = {}) {
    const client = options.client ?? this.prisma;
    const live = await client.emailCode.findFirst({
      where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!live || live.attempts >= MAX_ATTEMPTS) {
      throw new ApiError(400, 'CODE_INVALID', 'That code has expired. Ask for a new one.');
    }
    if (!EmailCodeService.same(live.codeHash, sha256(code))) {
      const attempts = live.attempts + 1;
      await client.emailCode.update({
        where: { id: live.id },
        data: { attempts, ...(attempts >= MAX_ATTEMPTS ? { usedAt: new Date() } : {}) },
      });
      throw new ApiError(400, 'CODE_INVALID', attempts >= MAX_ATTEMPTS ? 'Too many wrong tries. Ask for a new code.' : 'That code is not right. Check the email and try again.');
    }
    if (options.consume) {
      const claimed = await client.emailCode.updateMany({ where: { id: live.id, usedAt: null }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new ApiError(400, 'CODE_INVALID', 'That code has already been used. Ask for a new one.');
    }
  }

  private static same(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
