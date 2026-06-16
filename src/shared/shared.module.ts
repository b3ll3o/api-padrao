import { Module } from '@nestjs/common';
import { PasswordHasher } from '../shared/domain/services/password-hasher.service';
import { BcryptPasswordHasherService } from '../shared/infrastructure/services/bcrypt-password-hasher.service';
import { AppConfig } from './infrastructure/config/app.config';
import { PlanoService } from './infrastructure/throttling/plano.service';
import { TenantThrottlerGuard } from './infrastructure/throttling/tenant-throttler.guard';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: PasswordHasher,
      useClass: BcryptPasswordHasherService,
    },
    AppConfig,
    PlanoService,
    TenantThrottlerGuard,
  ],
  exports: [PasswordHasher, AppConfig, PlanoService, TenantThrottlerGuard],
})
export class SharedModule {}
