import { createHash, randomBytes } from 'crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { argon2Verify, argon2id } from 'hash-wasm';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash: string | null = null;

  async onModuleInit() {
    await this.warmup();
  }

  async hash(password: string): Promise<string> {
    return argon2id({
      password,
      salt: randomBytes(16),
      parallelism: 1,
      iterations: 2,
      memorySize: 19456,
      hashLength: 32,
      outputType: 'encoded',
    });
  }

  async matches(storedHash: string | null, password: string): Promise<boolean> {
    await this.warmup();
    const ok = await argon2Verify({
      password,
      hash: storedHash ?? this.dummyHash!,
    });
    return storedHash !== null && ok;
  }

  private async warmup() {
    if (!this.dummyHash) {
      this.dummyHash = await this.hash(randomBytes(32).toString('hex'));
    }
  }
}
