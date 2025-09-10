import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { UsuariosModule } from './usuarios/usuarios.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/application/guards/auth.guard';
import { PermissoesModule } from './permissoes/permissoes.module';
import { PerfisModule } from './perfis/perfis.module';
import { PermissaoGuard } from './auth/application/guards/permissao.guard';

@Module({
  imports: [
    UsuariosModule,
    PrismaModule,
    AuthModule,
    PermissoesModule,
    PerfisModule,
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
  ],
})
export class AppModule {}
