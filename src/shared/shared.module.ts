import { Module } from '@nestjs/common';
import { PasswordHasher } from '../shared/domain/services/password-hasher.service';
import { BcryptPasswordHasherService } from '../shared/infrastructure/services/bcrypt-password-hasher.service';
import { AppConfig } from './infrastructure/config/app.config';

@Module({
  providers: [
    {
      provide: PasswordHasher,
      useClass: BcryptPasswordHasherService,
    },
    AppConfig,
  ],
  exports: [PasswordHasher, AppConfig],
})
export class SharedModule {}
