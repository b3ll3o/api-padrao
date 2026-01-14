import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const EmpresaId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.headers['x-empresa-id'] as string;
  },
);
