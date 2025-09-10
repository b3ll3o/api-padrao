import { SetMetadata } from '@nestjs/common';

export const PERMISSAO_KEY = 'permissao';
export const TemPermissao = (permissaoCodigos: string | string[]) =>
  SetMetadata(PERMISSAO_KEY, permissaoCodigos);
