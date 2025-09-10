import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSAO_KEY } from '../decorators/temPermissao.decorator'; // Changed import path
import { Request } from 'express';

@Injectable()
export class PermissaoGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissaoCodigo = this.reflector.getAllAndOverride<string>( // Changed type to string
      PERMISSAO_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissaoCodigo) {
      return true; // No permissao required for this route
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.usuarioLogado; // User attached by AuthGuard

    if (!user || !user.perfis) {
      throw new ForbiddenException(
        'Usuário não possui perfis ou permissões suficientes.',
      );
    }

    const hasPermissao = user.perfis.some((perfil) =>
      perfil.permissoes?.some(
        (permissao) => permissao.codigo === requiredPermissaoCodigo, // Changed to permissao.codigo
      ),
    );

    if (!hasPermissao) {
      throw new ForbiddenException(
        'Usuário não possui permissões suficientes para acessar este recurso.',
      );
    }

    return true;
  }
}
