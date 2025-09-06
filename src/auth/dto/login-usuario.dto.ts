import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginUsuarioDto {
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'A senha deve ter no mínimo 8 caracteres' })
  senha: string;
}
