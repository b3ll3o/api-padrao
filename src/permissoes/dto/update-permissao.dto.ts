import { PartialType } from '@nestjs/mapped-types';
import { CreatePermissaoDto } from './create-permissao.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePermissaoDto extends PartialType(CreatePermissaoDto) {
  @ApiPropertyOptional({
    description:
      'Indica se a permissão está ativa ou inativa (para soft delete)',
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
