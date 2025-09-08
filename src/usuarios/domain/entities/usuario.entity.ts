import * as bcrypt from 'bcrypt';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Perfil } from '../../../perfis/domain/entities/perfil.entity';

export class Usuario {
  @ApiProperty({
    description: 'ID único do usuário',
    example: 1
  })
  id: number;

  @ApiProperty({
    description: 'Email do usuário',
    example: 'usuario@exemplo.com'
  })
  email: string;

  @ApiPropertyOptional({
    description: 'Senha do usuário (não retornada nas consultas)',
    example: 'senha123',
    writeOnly: true
  })
  senha?: string;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2025-09-08T10:00:00Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Data da última atualização do registro',
    example: '2025-09-08T10:00:00Z'
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Lista de perfis associados ao usuário',
    type: () => [Perfil]
  })
  perfis?: Perfil[];

  async comparePassword(password: string): Promise<boolean> {
    if (!this.senha) {
      return false;
    }
    return bcrypt.compare(password, this.senha);
  }
}
