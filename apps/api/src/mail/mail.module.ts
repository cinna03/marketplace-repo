import { Module } from '@nestjs/common';
import { LogMailer } from './log-mailer';
import { Mailer } from './mailer';

@Module({
  providers: [{ provide: Mailer, useClass: LogMailer }],
  exports: [Mailer],
})
export class MailModule {}
