import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Callback interna de extração do empresaId.
 * Exportada para permitir testes unitários da lógica de extração.
 * O decorator `EmpresaId` é construído a partir desta callback via `createParamDecorator`.
 *
 * Ordem de prioridade:
 * 1. `request.headers['x-empresa-id']` (header — confiável pois vem do gateway de auth)
 * 2. `request.user.empresaId` (do JWT, set direto)
 * 3. `request.user.empresas?.[0]?.id` (multi-tenant JWT, fallback)
 */
export const extractEmpresaId = (
  _data: unknown,
  ctx: ExecutionContext,
): string | undefined => {
  const request = ctx.switchToHttp().getRequest();
  return (request.headers['x-empresa-id'] ||
    request.user?.empresaId ||
    request.user?.empresas?.[0]?.id) as string | undefined;
};

export const EmpresaId = createParamDecorator(extractEmpresaId);
