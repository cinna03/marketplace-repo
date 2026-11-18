import { randomBytes } from 'crypto';
import { FieldCipher } from './field-cipher';

describe('FieldCipher', () => {
  const cipher = new FieldCipher(randomBytes(32));

  it('round-trips a street address', () => {
    const encrypted = cipher.encrypt('12 Gallery Lane');
    expect(encrypted).not.toContain('Gallery');
    expect(cipher.decrypt(encrypted)).toBe('12 Gallery Lane');
  });

  it('rejects a tampered payload', () => {
    const encrypted = cipher.encrypt('secret');
    const parts = encrypted.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });
});
