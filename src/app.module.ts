import { Module, ClassSerializerInterceptor } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { BullModule } from '@nestjs/bullmq';

import { UsuariosModule } from './usuarios/usuarios.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/application/guards/auth.guard';
import { PermissoesModule } from './permissoes/permissoes.module';
import { PerfisModule } from './perfis/perfis.module';
import { PermissaoGuard } from './auth/application/guards/permissao.guard';
import { PasswordHasher } from './shared/domain/services/password-hasher.service';
import { BcryptPasswordHasherService } from './shared/infrastructure/services/bcrypt-password-hasher.service';
import { envValidationSchema } from './config/env.validation';
import { EmpresasModule } from './empresas/empresas.module';
import { AllExceptionsFilter } from './shared/infrastructure/filters/all-exceptions.filter';
import { LoggingInterceptor } from './shared/infrastructure/interceptors/logging.interceptor';
import { EmpresaContext } from './shared/infrastructure/services/empresa-context.service';
import { EmpresaInterceptor } from './shared/infrastructure/interceptors/empresa.interceptor';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { HealthModule } from './shared/infrastructure/health/health.module';
import { SharedModule } from './shared/shared.module';
import { AppConfig } from './shared/infrastructure/config/app.config';
import { AuditInterceptor } from './shared/infrastructure/interceptors/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [SharedModule],
      inject: [AppConfig],
      useFactory: async (config: AppConfig) => ({
        store: await redisStore({
          socket: {
            host: config.redisHost,
            port: config.redisPort,
          },
          ttl: config.cacheTtl,
        }),
      }),
    }),
    BullModule.forRootAsync({
      imports: [SharedModule],
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        connection: {
          host: config.redisHost,
          port: config.redisPort,
        },
      }),
    }),
    UsuariosModule,
    PrismaModule,
    AuthModule,
    PermissoesModule,
    PerfisModule,
    EmpresasModule,
    HealthModule,
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: parseInt(process.env.THROTTLER_SHORT_TTL || '1000', 10),
        limit: parseInt(process.env.THROTTLER_SHORT_LIMIT || '3', 10),
      },
      {
        name: 'medium',
        ttl: parseInt(process.env.THROTTLER_MEDIUM_TTL || '10000', 10),
        limit: parseInt(process.env.THROTTLER_MEDIUM_LIMIT || '20', 10),
      },
      {
        name: 'long',
        ttl: parseInt(process.env.THROTTLER_LONG_TTL || '60000', 10),
        limit: parseInt(process.env.THROTTLER_LONG_LIMIT || '100', 10),
      },
      {
        name: 'sensitive',
        ttl: parseInt(process.env.THROTTLER_SENSITIVE_TTL || '60000', 10),
        limit: parseInt(process.env.THROTTLER_SENSITIVE_LIMIT || '10', 10),
      },
    ]),
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissaoGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ClassSerializerInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: EmpresaInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: PasswordHasher,
      useClass: BcryptPasswordHasherService,
    },
    EmpresaContext,
  ],
})
export class AppModule {}
