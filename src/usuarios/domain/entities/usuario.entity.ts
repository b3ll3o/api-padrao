import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UsuarioEmpresa } from './usuario-empresa.entity';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../../shared/domain/entities/base.entity';

export class Usuario extends BaseEntity {
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

  @ApiPropertyOptional({
    description:
      'Lista de empresas e seus respectivos perfis associados ao usuário',
    type: [UsuarioEmpresa],
  })
  empresas?: UsuarioEmpresa[];
}
