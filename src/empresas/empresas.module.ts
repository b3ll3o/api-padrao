import { Module } from '@nestjs/common';
import { EmpresasService } from './application/services/empresas.service';
import { EmpresasController } from './application/controllers/empresas.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EmpresaRepository } from './domain/repositories/empresa.repository';
import { PrismaEmpresaRepository } from './infrastructure/repositories/prisma-empresa.repository';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { PerfisModule } from '../perfis/perfis.module';

@Module({
  imports: [PrismaModule, UsuariosModule, PerfisModule],
  controllers: [EmpresasController],
  providers: [
    EmpresasService,
    {
      provide: EmpresaRepository,
      useClass: PrismaEmpresaRepository,
    },
  ],
  exports: [EmpresasService],
})
export class EmpresasModule {}
