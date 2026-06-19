// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/dto/login-usuario.dto.spec.ts

import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';

export class LoginUsuarioDto {
  /**
   * Endereço de e-mail do usuário
   * @example "user@example.com"
   */
  @IsNotEmpty({ message: 'O e-mail não pode ser vazio' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  /**
   * Senha do usuário
   * @example "Password123!"
   */
  @IsNotEmpty({ message: 'A senha não pode ser vazia' })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter no mínimo 8 caracteres' })
  senha: string;
}
