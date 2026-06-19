import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
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

  // [DOS-001] `@Max(100)` evita que um cliente peça `limit=1_000_000`
  // e force um SELECT/serialize pesado que mata a latência geral. Limite
  // generoso para casos legítimos (relatórios); valores acima exigem
  // uma rota dedicada de export assíncrono.
  @ApiPropertyOptional({
    description: 'Número de itens por página (máximo 100)',
    minimum: 1,
    maximum: 100,
    default: 10,
    example: 10,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;
}
