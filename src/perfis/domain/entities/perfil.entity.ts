import { Permissao } from 'src/permissoes/domain/entities/permissao.entity';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../shared/domain/entities/base.entity';

export class Perfil extends BaseEntity {
  @ApiProperty({ description: 'Nome do perfil', example: 'Administrador' })
  nome: string;

  @ApiProperty({ description: 'Código do perfil', example: 'ADMIN' })
  codigo: string;

  @ApiProperty({
    description: 'Descrição do perfil',
    example: 'Perfil com acesso total ao sistema',
  })
  descricao: string;

  @ApiProperty({
    description: 'ID da empresa vinculada ao perfil',
    example: 'uuid-da-empresa',
  })
  empresaId: string;

  @ApiProperty({
    description: 'Permissões associadas ao perfil',
    type: [Permissao],
    required: false,
  })
  permissoes?: Permissao[];
}
