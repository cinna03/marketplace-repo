export abstract class Mailer {
  abstract sendPasswordReset(to: string, resetUrl: string): Promise<void>;
}
