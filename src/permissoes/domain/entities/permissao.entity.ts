import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'; // Added ApiPropertyOptional

export class Permissao {
  @ApiProperty({ description: 'ID da permissão', example: 1 })
  id: number;

  @ApiProperty({ description: 'Nome da permissão', example: 'read:users' })
  nome: string;

  @ApiProperty({ description: 'Código da permissão', example: 'READ_USERS' })
  codigo: string;

  @ApiProperty({
    description: 'Descrição da permissão',
    example: 'Permite ler usuários',
  })
  descricao: string;

  @ApiPropertyOptional({
    description: 'Data de deleção lógica do registro',
    example: '2025-09-08T10:00:00Z',
    nullable: true,
  })
  deletedAt?: Date | null; // Added

  @ApiProperty({ description: 'Status ativo da permissão', example: true })
  ativo: boolean;
}
