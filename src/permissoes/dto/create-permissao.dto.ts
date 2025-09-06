import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissaoDto {
  @ApiProperty({
    description: 'The name of the permission',
    example: 'read:users',
  })
  @IsString()
  @IsNotEmpty()
  nome: string;
}
