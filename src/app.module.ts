import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { UsuariosModule } from './usuarios/usuarios.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/application/guards/auth.guard';

@Module({
  imports: [UsuariosModule, PrismaModule, AuthModule],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
