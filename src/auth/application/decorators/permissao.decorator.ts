import { SetMetadata } from '@nestjs/common';

export const PERMISSAO_KEY = 'permissao';
export const HasPermissao = (permissaoId: number) =>
  SetMetadata(PERMISSAO_KEY, permissaoId);
