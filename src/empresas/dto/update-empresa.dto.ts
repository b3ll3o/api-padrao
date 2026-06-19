// BDD: features/empresas.feature
// SDD: .openspec/changes/empresas/design.md
// ATDD: test/empresas.e2e-spec.ts
// TDD: src/empresas/dto/update-empresa.dto.spec.ts

import { PartialType } from '@nestjs/swagger';
import { CreateEmpresaDto } from './create-empresa.dto';

export class UpdateEmpresaDto extends PartialType(CreateEmpresaDto) {}
