import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('verifies the original password and rejects a different one', async () => {
    const hash = await passwords.hash('Correct-Horse-1');
    expect(hash).not.toContain('Correct-Horse-1');
    await expect(passwords.matches(hash, 'Correct-Horse-1')).resolves.toBe(true);
    await expect(passwords.matches(hash, 'Correct-Horse-2')).resolves.toBe(false);
    await expect(passwords.matches(null, 'Correct-Horse-1')).resolves.toBe(false);
  });
});
