import { Module, ClassSerializerInterceptor } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        pinoHttp: {
          transport:
            configService.get('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty' }
              : undefined,
          level:
            configService.get('NODE_ENV') !== 'production' ? 'debug' : 'info',
          autoLogging: false,
          serializers: {
            req: (req) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
          },
        },
      }),
    }),
    UsuariosModule,
    PrismaModule,
    AuthModule,
    PermissoesModule,
    PerfisModule,
    EmpresasModule,
  ],
  controllers: [],
  providers: [
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
      provide: PasswordHasher,
      useClass: BcryptPasswordHasherService,
    },
  ],
})
export class AppModule {}

// Test comment for pre-commit hooks
