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

  @ApiProperty({
    description: 'O código da permissão',
    example: 'READ_USERS',
  })
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @ApiProperty({
    description: 'A descrição da permissão',
    example: 'Permissão para ler usuários',
  })
  @IsString()
  @IsNotEmpty()
  descricao: string;
}
