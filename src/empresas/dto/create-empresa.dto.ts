import { IsString, IsNotEmpty, IsOptional, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEmpresaDto {
  @ApiProperty({
    example: 'Minha Empresa Ltda',
    description: 'Nome da empresa',
  })
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @IsString({ message: 'O nome deve ser uma string' })
  nome: string;

  @ApiProperty({
    example: 'Empresa de tecnologia focada em soluções web',
    description: 'Descrição da empresa',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'A descrição deve ser uma string' })
  descricao?: string;

  @ApiProperty({
    example: 1,
    description: 'ID do usuário responsável pela empresa',
  })
  @IsNotEmpty({ message: 'O ID do responsável é obrigatório' })
  @IsInt({ message: 'O ID do responsável deve ser um número inteiro' })
  responsavelId: number;
}
