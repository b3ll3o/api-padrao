import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  Matches,
  IsNotEmpty,
  IsNumber,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer'; // Import Type

export class CreateUsuarioDto {
  @ApiProperty({
    example: 'test@example.com',
    description: 'Endereço de e-mail do usuário',
  })
  @IsNotEmpty({ message: 'O e-mail não pode ser vazio' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty({ example: 'Password123!', description: 'Senha do usuário' })
  @IsNotEmpty({ message: 'A senha não pode ser vazia' })
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
  @IsArray({ message: 'perfisIds deve ser um array' })
  @IsNumber({}, { each: true, message: 'Cada ID de perfil deve ser um número' })
  @Type(() => Number) // Add Type decorator for transformation
  perfisIds?: number[];
}
