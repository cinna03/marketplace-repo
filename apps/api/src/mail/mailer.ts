export type EmailCodeKind = 'password_reset' | 'email_verify';

export abstract class Mailer {
  /** Sends a 6-digit code, either to reset a password or to confirm the address. */
  abstract sendCode(to: string, kind: EmailCodeKind, code: string): Promise<void>;
}
