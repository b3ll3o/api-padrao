import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResponseDto<T> {
  @ApiProperty({
    isArray: true,
    description: 'Lista de itens na página atual',
  })
  data: T[];

  @ApiProperty({
    type: Number,
    description: 'Número total de itens disponíveis',
    example: 100,
  })
  total: number;

  @ApiProperty({
    type: Number,
    description: 'Página atual',
    example: 1,
  })
  page: number;

  @ApiProperty({
    type: Number,
    description: 'Número de itens por página',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    type: Number,
    description: 'Número total de páginas',
    example: 10,
  })
  totalPages: number;
}
