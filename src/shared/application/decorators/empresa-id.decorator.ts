import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const EmpresaId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    // O EmpresaInterceptor já garante que este header ou o valor do JWT esteja acessível
    return (request.headers['x-empresa-id'] ||
      request.user?.empresaId) as string;
  },
);
