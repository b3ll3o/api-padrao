// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/auth.module.spec.ts

import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './application/controllers/auth.controller';
import { AuthService } from './application/services/auth.service';
import { PasswordRecoveryService } from './application/services/password-recovery.service';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { AuthorizationService } from '../shared/domain/services/authorization.service';
import { DefaultAuthorizationService } from './infrastructure/services/default-authorization.service';
import { SharedModule } from '../shared/shared.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaPasswordResetTokenRepository } from './infrastructure/repositories/prisma-password-reset-token.repository';
import { PasswordResetTokenRepository } from './domain/repositories/password-reset-token.repository';
import { RefreshTokenRepository } from './domain/repositories/refresh-token.repository';
import { PrismaRefreshTokenRepository } from './infrastructure/repositories/prisma-refresh-token.repository';
import { LoginHistoryRepository } from './domain/repositories/login-history.repository';
import { PrismaLoginHistoryRepository } from './infrastructure/repositories/prisma-login-history.repository';
import { UnitOfWork } from './domain/services/unit-of-work.service';
import { PrismaUnitOfWork } from './infrastructure/services/prisma-unit-of-work.service';
import { LoginAttemptTracker } from './domain/services/login-attempt-tracker.service';
import { CacheLoginAttemptTracker } from './infrastructure/services/cache-login-attempt-tracker.service';

@Module({
  imports: [
    forwardRef(() => UsuariosModule),
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRES_IN') as any,
        },
      }),
      inject: [ConfigService],
    }),
    SharedModule,
  ],
  providers: [
    AuthService,
    PasswordRecoveryService,
    PrismaPasswordResetTokenRepository,
    JwtStrategy,
    {
      provide: AuthorizationService,
      useClass: DefaultAuthorizationService,
    },
    // [ALT-001] Bind das portas RefreshTokenRepository e LoginHistoryRepository.
    // AuthService agora depende apenas de abstrações (DIP).
    {
      provide: RefreshTokenRepository,
      useClass: PrismaRefreshTokenRepository,
    },
    {
      provide: LoginHistoryRepository,
      useClass: PrismaLoginHistoryRepository,
    },
    // [Cleanup Sprint 2] Bind da porta PasswordResetTokenRepository.
    // PasswordRecoveryService agora depende apenas de abstrações (DIP).
    {
      provide: PasswordResetTokenRepository,
      useClass: PrismaPasswordResetTokenRepository,
    },
    // [ALT-002] Bind da porta UnitOfWork.
    {
      provide: UnitOfWork,
      useClass: PrismaUnitOfWork,
    },
    // [ALT-003] Bind da porta LoginAttemptTracker (account lockout via Redis).
    {
      provide: LoginAttemptTracker,
      useClass: CacheLoginAttemptTracker,
    },
  ],
  controllers: [AuthController],
  // [H4] Exporta `RefreshTokenRepository` para que `UsuariosService.update()`
  // possa revogar refresh tokens quando a senha é alterada (defesa em
  // profundidade — mesmo padrão de `PasswordRecoveryService.resetPassword()`).
  exports: [
    AuthService,
    PasswordRecoveryService,
    AuthorizationService,
    RefreshTokenRepository,
  ],
})
export class AuthModule {}
