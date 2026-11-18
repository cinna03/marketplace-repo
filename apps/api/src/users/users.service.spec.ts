import { randomBytes, randomUUID } from 'crypto';
import { FieldCipher } from '../common/crypto/field-cipher';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyService } from '../profiles/journey.service';
import { UsersService } from './users.service';

describe('UsersService export', () => {
  it('returns personal data and omits secrets', async () => {
    const cipher = new FieldCipher(randomBytes(32));
    const userId = randomUUID();
    const stored = {
      id: userId,
      email: 'collector@example.com',
      passwordHash: 'stored-password-hash',
      phoneCiphertext: cipher.encrypt('+15551212'),
      emailVerifiedAt: null,
      status: 'active',
      createdAt: new Date('2026-11-17T00:00:00Z'),
      roles: [{ role: { name: 'collector' } }],
      addresses: [
        {
          id: randomUUID(),
          label: 'Home',
          recipientName: 'A Collector',
          line1Ciphertext: cipher.encrypt('12 Gallery Lane'),
          line2Ciphertext: null,
          city: 'Kigali',
          region: null,
          postalCode: '00000',
          countryCode: 'RW',
          phoneCiphertext: null,
          isDefaultShipping: true,
        },
      ],
      oauthAccounts: [{ provider: 'google' }],
      privacyRequests: [],
      mfaFactors: [{ confirmedAt: new Date(), disabledAt: null, secretCiphertext: cipher.encrypt('TOTPSECRET') }],
    };

    const prisma = {
      user: {
        findUnique: async () => stored,
      },
    };
    const service = new UsersService(prisma as unknown as PrismaService, cipher, {} as JourneyService);
    const exported = await service.exportAccount(userId);
    const serialized = JSON.stringify(exported);

    expect(exported.user.phone).toBe('+15551212');
    expect(exported.addresses[0].line1).toBe('12 Gallery Lane');
    expect(exported.user.mfaEnabled).toBe(true);
    expect(serialized).not.toContain('stored-password-hash');
    expect(serialized).not.toContain('TOTPSECRET');
    expect(serialized).not.toContain('line1Ciphertext');
  });
});
