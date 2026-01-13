import { Module } from '@nestjs/common';
import { UsuariosService } from './application/services/usuarios.service';
import { UsuariosController } from './application/controllers/usuarios.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UsuarioRepository } from './domain/repositories/usuario.repository';
import { PrismaUsuarioRepository } from './infrastructure/repositories/prisma-usuario.repository';
import {
  IUsuarioAuthorizationService,
  UsuarioAuthorizationService,
} from './application/services/usuario-authorization.service';
import { SharedModule } from '../shared/shared.module';
import { EmpresaRepository } from '../empresas/domain/repositories/empresa.repository';
import { PrismaEmpresaRepository } from '../empresas/infrastructure/repositories/prisma-empresa.repository';

@Module({
  imports: [PrismaModule, SharedModule],
  controllers: [UsuariosController],
  providers: [
    UsuariosService,
    {
      provide: UsuarioRepository,
      useClass: PrismaUsuarioRepository,
    },
    {
      provide: EmpresaRepository,
      useClass: PrismaEmpresaRepository,
    },
    {
      provide: IUsuarioAuthorizationService,
      useClass: UsuarioAuthorizationService,
    },
  ],
  exports: [UsuariosService, UsuarioRepository],
})
export class UsuariosModule {}
