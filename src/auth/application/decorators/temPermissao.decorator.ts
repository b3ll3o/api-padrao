import { SetMetadata } from '@nestjs/common';

export const PERMISSAO_KEY = 'permissao';
export const TemPermissao = (permissaoCodigo: string) =>
  SetMetadata(PERMISSAO_KEY, permissaoCodigo);
