import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ISoftDelete } from './soft-delete.interface';

export abstract class BaseEntity implements ISoftDelete {
  @ApiProperty({
    description: 'ID único do registro',
    example: 1,
  })
  id: number;

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
  deletedAt?: Date | null;

  @ApiProperty({ description: 'Status ativo do registro', example: true })
  ativo: boolean;
}
