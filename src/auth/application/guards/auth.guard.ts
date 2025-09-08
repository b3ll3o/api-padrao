import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../../infrastructure/strategies/jwt.strategy';
import { Request } from 'express';

declare module 'express' {
  interface Request {
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
    const request = context.switchToHttp().getRequest<Request>();
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

  handleRequest(err: any, user: any): any {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    // The user is already attached to request.usuarioLogado in canActivate
    return user;
  }
}
