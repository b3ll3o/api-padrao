import { ApiProperty } from '@nestjs/swagger';

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
}
