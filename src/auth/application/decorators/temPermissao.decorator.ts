// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/application/decorators/temPermissao.decorator.spec.ts

import { SetMetadata } from '@nestjs/common';

export const PERMISSAO_KEY = 'permissao';
export const TemPermissao = (permissaoCodigos: string | string[]) =>
  SetMetadata(PERMISSAO_KEY, permissaoCodigos);
