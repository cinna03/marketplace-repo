import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailCodeKind, Mailer } from './mailer';

/** Development mailer: writes the code to the API log instead of sending an email. */
@Injectable()
export class LogMailer extends Mailer {
  private readonly logger = new Logger(LogMailer.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async sendCode(to: string, kind: EmailCodeKind, code: string): Promise<void> {
    if (this.config.get<string>('NODE_ENV') === 'development') {
      this.logger.log(`${kind === 'password_reset' ? 'Password reset' : 'Email confirmation'} code for ${to}: ${code}`);
      return;
    }
    this.logger.error('The mailer is not configured, so the code was not sent');
  }
}
