import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UsuarioEmpresa } from './usuario-empresa.entity';
import { Exclude } from 'class-transformer';

export class Usuario {
  @ApiProperty({
    description: 'ID único do usuário',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Email do usuário',
    example: 'usuario@exemplo.com',
  })
  email: string;

  @ApiPropertyOptional({
    description: 'Senha do usuário (não retornada nas consultas)',
    example: 'senha123',
    writeOnly: true,
  })
  @Exclude()
  senha?: string;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2025-09-08T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Data da última atualização do registro',
    example: '2025-09-08T10:00:00Z',
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Data de deleção lógica do registro',
    example: '2025-09-08T10:00:00Z',
    nullable: true,
  })
  deletedAt?: Date | null; // Added

  @ApiProperty({ description: 'Status ativo do usuário', example: true })
  ativo: boolean;

  @ApiPropertyOptional({
    description:
      'Lista de empresas e seus respectivos perfis associados ao usuário',
    type: [UsuarioEmpresa],
  })
  empresas?: UsuarioEmpresa[];
}
