import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { UsuariosModule } from './usuarios/usuarios.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/application/guards/auth.guard';
import { PermissoesModule } from './permissoes/permissoes.module';
import { PerfisModule } from './perfis/perfis.module';
import { PermissaoGuard } from './auth/application/guards/permissao.guard';
import { PasswordHasher } from './shared/domain/services/password-hasher.service';
import { BcryptPasswordHasherService } from './shared/infrastructure/services/bcrypt-password-hasher.service';
import { RateLimitGuard } from './auth/application/guards/rate-limit.guard';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    UsuariosModule,
    PrismaModule,
    AuthModule,
    PermissoesModule,
    PerfisModule,
    SharedModule,
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
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: PasswordHasher,
      useClass: BcryptPasswordHasherService,
    },
  ],
})
export class AppModule {}
