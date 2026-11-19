import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { ApiError } from '../common/errors';
import { Mailer } from './mailer';

@Injectable()
export class SmtpMailer extends Mailer {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST') || '';
    const user = this.config.get<string>('SMTP_USER') || '';
    const pass = this.config.get<string>('SMTP_PASS') || '';
    const from = this.config.get<string>('SMTP_FROM') || user;
    if (!host || !from) {
      throw new ApiError(503, 'MAIL_NOT_CONFIGURED', 'The shop cannot send email yet, so the confirmation code cannot be delivered.');
    }
    const port = this.config.get<number>('SMTP_PORT') || 587;
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
    await transport.sendMail({ from, to, subject, text });
  }
}
