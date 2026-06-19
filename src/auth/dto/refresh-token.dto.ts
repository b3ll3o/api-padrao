// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/dto/refresh-token.dto.spec.ts

import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'O refresh token obtido no login',
    example: 'uuid-do-token',
  })
  @IsNotEmpty({ message: 'O refresh token não pode ser vazio' })
  @IsString()
  refresh_token: string;
}
