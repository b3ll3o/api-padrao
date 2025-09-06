import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissaoDto {
  @ApiProperty({
    description: 'O nome da permissão',
    example: 'read:users',
  })
  @IsString()
  @IsNotEmpty()
  nome: string;
}
