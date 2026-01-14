import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsNumber,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePerfilDto {
  @ApiProperty({
    description: 'O nome do perfil',
    example: 'Administrador',
  })
  @IsString()
  @IsNotEmpty()
  nome: string;

  @ApiProperty({
    description: 'O código do perfil',
    example: 'ADMIN',
  })
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @ApiProperty({
    description: 'A descrição do perfil',
    example: 'Perfil de administrador do sistema',
  })
  @IsString()
  @IsNotEmpty()
  descricao: string;

  @ApiProperty({
    description: 'ID da empresa vinculada ao perfil',
    example: 'uuid-da-empresa',
  })
  @IsString()
  @IsNotEmpty()
  empresaId: string;

  @ApiProperty({
    description: 'Array de IDs de permissões',
    example: [1, 2, 3],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  permissoesIds?: number[];
}
