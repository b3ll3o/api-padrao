// BDD: features/permissoes.feature
// SDD: .openspec/changes/permissoes/design.md
// ATDD: test/permissoes.e2e-spec.ts
// TDD: src/permissoes/permissoes.module.spec.ts

import { Module, forwardRef } from '@nestjs/common';
import { PermissoesService } from './application/services/permissoes.service';
import { PermissoesController } from './application/controllers/permissoes.controller';
import { PermissaoRepository } from './domain/repositories/permissao.repository';
import { PrismaPermissaoRepository } from './infrastructure/repositories/prisma-permissao.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module'; // Added

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)], // Added AuthModule
  controllers: [PermissoesController],
  providers: [
    PermissoesService,
    {
      provide: PermissaoRepository,
      useClass: PrismaPermissaoRepository,
    },
  ],
  exports: [PermissoesService, PermissaoRepository],
})
export class PermissoesModule {}
