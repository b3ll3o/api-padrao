// BDD: features/perfis.feature
// SDD: .openspec/changes/perfis/design.md
// ATDD: test/perfis.e2e-spec.ts
// TDD: src/perfis/dto/update-perfil.dto.spec.ts

import { PartialType } from '@nestjs/mapped-types';
import { CreatePerfilDto } from './create-perfil.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePerfilDto extends PartialType(CreatePerfilDto) {
  @ApiPropertyOptional({
    description: 'Indica se o perfil está ativo ou inativo (para soft delete)',
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
