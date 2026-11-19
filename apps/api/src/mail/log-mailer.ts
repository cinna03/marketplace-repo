import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mailer } from './mailer';

@Injectable()
export class LogMailer extends Mailer {
  private readonly logger = new Logger(LogMailer.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    if (this.config.get<string>('NODE_ENV') === 'development') {
      this.logger.log(`Password reset for ${to}: ${resetUrl}`);
      return;
    }
    this.logger.error('Password reset mailer is not configured');
  }
}
