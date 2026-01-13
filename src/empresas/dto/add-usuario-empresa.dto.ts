import { IsArray, IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddUsuarioEmpresaDto {
  @ApiProperty({ example: 1, description: 'ID do usuário a ser vinculado' })
  @IsInt({ message: 'O ID do usuário deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O ID do usuário não pode ser vazio' })
  usuarioId: number;

  @ApiProperty({
    example: [1, 2],
    description: 'IDs dos perfis que o usuário terá na empresa',
  })
  @IsArray({ message: 'Os IDs dos perfis devem ser um array' })
  @IsInt({
    each: true,
    message: 'Cada ID de perfil deve ser um número inteiro',
  })
  @IsNotEmpty({ message: 'A lista de perfis não pode estar vazia' })
  perfilIds: number[];
}
