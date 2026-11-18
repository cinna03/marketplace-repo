import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FieldCipher, decodePiiKey } from './field-cipher';
import { PasswordService } from './password.service';

@Global()
@Module({
  providers: [
    PasswordService,
    {
      provide: FieldCipher,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new FieldCipher(decodePiiKey(config.getOrThrow<string>('PII_ENCRYPTION_KEY'))),
    },
  ],
  exports: [PasswordService, FieldCipher],
})
export class CryptoModule {}
