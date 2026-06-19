// BDD: features/usuarios.feature
// SDD: .openspec/changes/usuarios/design.md
// ATDD: test/usuarios.e2e-spec.ts
// TDD: src/usuarios/dto/update-usuario.dto.spec.ts

import { PartialType } from '@nestjs/mapped-types';
import { CreateUsuarioDto } from './create-usuario.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUsuarioDto extends PartialType(CreateUsuarioDto) {
  @ApiPropertyOptional({
    description: 'Indica se o usuário está ativo ou inativo (para soft delete)',
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
