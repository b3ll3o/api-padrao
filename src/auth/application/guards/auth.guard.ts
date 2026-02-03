import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../../infrastructure/strategies/jwt.strategy';
import { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    usuarioLogado?: JwtPayload;
    user?: JwtPayload;
  }
}

@Injectable()
export class AuthGuard extends PassportAuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const result = await super.canActivate(context);

    if (result) {
      request.usuarioLogado = request.user; // user is attached by AuthGuard
    }
    return result as boolean;
  }
}
