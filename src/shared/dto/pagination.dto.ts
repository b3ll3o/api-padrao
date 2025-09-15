import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Número da página (começa em 1)',
    minimum: 1,
    default: 1,
    example: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Número de itens por página',
    minimum: 1,
    default: 10,
    example: 10,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 10;
}
