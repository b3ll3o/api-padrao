// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/dto/reset-password.dto.spec.ts

import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  /**
   * Token opaco de 64 hex chars recebido por e-mail.
   * @example "a1b2c3..."
   */
  @ApiProperty({ description: 'Token recebido por e-mail' })
  @IsString()
  @IsNotEmpty({ message: 'O token não pode ser vazio' })
  @MaxLength(128, {
    message: 'O token deve ter no máximo 128 caracteres',
  })
  token!: string;

  /**
   * Nova senha do usuário. Requisitos: mínimo 8 caracteres, ao menos uma
   * letra maiúscula, uma minúscula e um número.
   * @example "NovaSenha123!"
   */
  @ApiProperty({ example: 'NovaSenha123!' })
  @IsString()
  @IsNotEmpty({ message: 'A senha não pode ser vazia' })
  @MinLength(8, { message: 'A senha deve ter no mínimo 8 caracteres' })
  @MaxLength(128)
  @Matches(/[A-Z]/, {
    message: 'A senha deve conter pelo menos uma letra maiúscula',
  })
  @Matches(/[a-z]/, {
    message: 'A senha deve conter pelo menos uma letra minúscula',
  })
  @Matches(/[0-9]/, { message: 'A senha deve conter pelo menos um número' })
  novaSenha!: string;
}
