import { Permissao } from 'src/permissoes/domain/entities/permissao.entity';
import { ApiProperty } from '@nestjs/swagger';

export class Perfil {
  @ApiProperty({ description: 'ID do perfil', example: 1 })
  id: number;

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
    description: 'Permissões associadas ao perfil',
    type: [Permissao],
    required: false,
  })
  permissoes?: Permissao[];
}
