import { profileFromClaims } from './oauth-claims';

describe('profileFromClaims', () => {
  it('accepts a verified email', () => {
    expect(
      profileFromClaims('google', {
        sub: 'google-user',
        email: 'Collector@Example.com',
        email_verified: true,
      }),
    ).toEqual({
      provider: 'google',
      providerUserId: 'google-user',
      email: 'collector@example.com',
      emailVerified: true,
    });
  });

  it('rejects an unverified email', () => {
    expect(() =>
      profileFromClaims('apple', { sub: 'apple-user', email: 'a@example.com', email_verified: false }),
    ).toThrow('verified');
  });

  it('rejects a token that omits email', () => {
    expect(() => profileFromClaims('apple', { sub: 'apple-user' })).toThrow('email');
  });
});
