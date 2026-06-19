// BDD: features/empresas.feature
// SDD: .openspec/changes/empresas/design.md
// ATDD: test/empresas.e2e-spec.ts
// TDD: src/empresas/empresas.module.spec.ts

import { Module, forwardRef } from '@nestjs/common';
import { EmpresasService } from './application/services/empresas.service';
import { EmpresasController } from './application/controllers/empresas.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EmpresaRepository } from './domain/repositories/empresa.repository';
import { PrismaEmpresaRepository } from './infrastructure/repositories/prisma-empresa.repository';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { PerfisModule } from '../perfis/perfis.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => UsuariosModule),
    forwardRef(() => PerfisModule),
    SharedModule,
  ],
  controllers: [EmpresasController],
  providers: [
    EmpresasService,
    {
      provide: EmpresaRepository,
      useClass: PrismaEmpresaRepository,
    },
  ],
  exports: [EmpresasService, EmpresaRepository],
})
export class EmpresasModule {}
