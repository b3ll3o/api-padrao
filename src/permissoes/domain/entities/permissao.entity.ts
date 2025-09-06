import { ApiProperty } from '@nestjs/swagger';

export class Permissao {
  @ApiProperty({ description: 'ID da permissão', example: 1 })
  id: number;

  @ApiProperty({ description: 'Nome da permissão', example: 'read:users' })
  nome: string;
}
