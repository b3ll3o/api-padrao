import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUsuarioDto {
  @ApiProperty({
    example: 'test@example.com',
    description: 'Endereço de e-mail do usuário',
  })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty({ example: 'Password123!', description: 'Senha do usuário' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'A senha deve ter no mínimo 8 caracteres' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      'A senha deve conter pelo menos uma letra maiúscula, uma minúscula, um número ou um caractere especial',
  })
  senha?: string;

  @ApiProperty({
    description: 'IDs dos perfis associados ao usuário',
    type: [Number],
    required: false,
  })
  @IsOptional()
  perfisIds?: number[];
}
