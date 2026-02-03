import { Module, ClassSerializerInterceptor } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validationSchema: envValidationSchema,
    }),
    UsuariosModule,
    PrismaModule,
    AuthModule,
    PermissoesModule,
    PerfisModule,
    EmpresasModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
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
      provide: PasswordHasher,
      useClass: BcryptPasswordHasherService,
    },
    EmpresaContext,
  ],
})
export class AppModule {}
