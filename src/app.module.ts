import {
  Module,
  ClassSerializerInterceptor,
  MiddlewareConsumer,
  NestModule,
} from '@nestjs/common';
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
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { HealthModule } from './shared/infrastructure/health/health.module';
import { SharedModule } from './shared/shared.module';
import { AppConfig } from './shared/infrastructure/config/app.config';
import { AuditInterceptor } from './shared/infrastructure/interceptors/audit.interceptor';
import { TenantThrottlerGuard } from './shared/infrastructure/throttling/tenant-throttler.guard';
import { CacheControlMiddleware } from './shared/infrastructure/middleware/cache-control.middleware';
import { MetricsModule } from './shared/infrastructure/metrics/metrics.module';
import { HttpMetricsInterceptor } from './shared/infrastructure/metrics/http-metrics.interceptor';
import { QueuesModule } from './shared/infrastructure/queues/queues.module';

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
    SharedModule,
    MetricsModule,
    QueuesModule,
    // [MED-005] Throttler com storage Redis para escalar em multi-instância.
    // Antes: in-memory → atacante podia bater `limit×N` distribuindo
    // requests entre instâncias. Agora todos compartilham o mesmo
    // contador via Redis. `useFactory` lê TTL/limit das mesmas env vars
    // de antes, mas via `AppConfig` para manter tipagem.
    ThrottlerModule.forRootAsync({
      imports: [SharedModule],
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          {
            name: 'short',
            ttl: config.throttlerShortTtl,
            limit: config.throttlerShortLimit,
          },
          {
            name: 'medium',
            ttl: config.throttlerMediumTtl,
            limit: config.throttlerMediumLimit,
          },
          {
            name: 'long',
            ttl: config.throttlerLongTtl,
            limit: config.throttlerLongLimit,
          },
          {
            name: 'sensitive',
            ttl: config.throttlerSensitiveTtl,
            limit: config.throttlerSensitiveLimit,
          },
        ],
        storage: new ThrottlerStorageRedisService({
          host: config.redisHost,
          port: config.redisPort,
        }),
      }),
    }),
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TenantThrottlerGuard,
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
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
    {
      provide: PasswordHasher,
      useClass: BcryptPasswordHasherService,
    },
    EmpresaContext,
  ],
})
// BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: HTTP Hardening
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-1
// ATDD: test/http-hardening.e2e-spec.ts
// TDD: src/shared/infrastructure/middleware/cache-control.middleware.spec.ts
// [Sprint1-HTTP] Aplica CacheControlMiddleware globalmente em todas as rotas.
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CacheControlMiddleware).forRoutes('*');
  }
}
