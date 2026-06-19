// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/shared/application/decorators/usuario-logado.decorator.spec.ts

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';

/**
 * Callback interna de extração do usuário logado.
 * Exportada para permitir testes unitários.
 */
export const extractUsuarioLogado = (
  _data: unknown,
  ctx: ExecutionContext,
): JwtPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.usuarioLogado;
};

export const UsuarioLogado = createParamDecorator(extractUsuarioLogado);
