import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  /**
   * E-mail do usuário que solicitou a recuperação de senha.
   * A resposta é sempre 200, mesmo que o e-mail não exista (anti-enumeração).
   * @example "joao@empresa.com"
   */
  @ApiProperty({ example: 'joao@empresa.com' })
  @IsString()
  @IsNotEmpty({ message: 'O e-mail não pode ser vazio' })
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(255)
  email!: string;
}
