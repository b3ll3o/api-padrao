import { Module } from '@nestjs/common';
import { UsuariosService } from './application/services/usuarios.service';
import { UsuariosController } from './application/controllers/usuarios.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UsuarioRepository } from './domain/repositories/usuario.repository';
import { PrismaUsuarioRepository } from './infrastructure/repositories/prisma-usuario.repository';

@Module({
  imports: [PrismaModule],
  controllers: [UsuariosController],
  providers: [
    UsuariosService,
    {
      provide: UsuarioRepository,
      useClass: PrismaUsuarioRepository,
    },
  ],
})
export class UsuariosModule {}
