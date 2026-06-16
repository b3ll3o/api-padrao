import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PasswordHasher } from '../shared/domain/services/password-hasher.service';
import { BcryptPasswordHasherService } from '../shared/infrastructure/services/bcrypt-password-hasher.service';
import { AppConfig } from './infrastructure/config/app.config';
import { PlanoService } from './infrastructure/throttling/plano.service';
import { TenantThrottlerGuard } from './infrastructure/throttling/tenant-throttler.guard';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EMAIL_SERVICE } from './domain/services/email.service';
import { LoggerEmailService } from './infrastructure/services/logger-email.service';
import { TemplateLoaderService } from './infrastructure/services/template-loader.service';
import {
  DefaultEmailSenderService,
  EMAIL_SENDER_SERVICE,
} from './application/services/email-sender.service';

/**
 * SharedModule — provê utilitários cross-cutting:
 *
 * - `PasswordHasher` (bcrypt)
 * - `AppConfig`, `PlanoService`, `TenantThrottlerGuard` (throttler)
 * - `EMAIL_SERVICE` (port) — bind em `LoggerEmailService` (mock Pino)
 * - `TemplateLoaderService` (boot de templates v1/*.tpl)
 * - `EMAIL_SENDER_SERVICE` (orquestrador) — `DefaultEmailSenderService`
 *
 * BDD: features/email-notifications.feature
 * SDD: .openspec/changes/email-notifications/design.md:REQ-EM-N03 (DIP)
 */
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    {
      provide: PasswordHasher,
      useClass: BcryptPasswordHasherService,
    },
    AppConfig,
    PlanoService,
    TenantThrottlerGuard,
    TemplateLoaderService,
    {
      provide: EMAIL_SERVICE,
      useClass: LoggerEmailService,
    },
    {
      provide: EMAIL_SENDER_SERVICE,
      useClass: DefaultEmailSenderService,
    },
  ],
  exports: [
    PasswordHasher,
    AppConfig,
    PlanoService,
    TenantThrottlerGuard,
    TemplateLoaderService,
    EMAIL_SERVICE,
    EMAIL_SENDER_SERVICE,
  ],
})
export class SharedModule {}
