export abstract class Mailer {
  abstract send(to: string, subject: string, text: string): Promise<void>;
}
