import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../shared/domain/entities/base.entity';

export class Permissao extends BaseEntity {
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
