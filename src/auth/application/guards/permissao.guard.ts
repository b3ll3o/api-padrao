import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSAO_KEY } from '../decorators/temPermissao.decorator'; // Changed import path
import { FastifyRequest } from 'fastify';

@Injectable()
export class PermissaoGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissoes = this.reflector.getAllAndOverride<
      string | string[]
    >(PERMISSAO_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissoes) {
      return true; // No permissao required for this route
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const user = request.usuarioLogado; // User attached by AuthGuard
    const empresaId = request.headers['x-empresa-id'] as string;

    if (!user || !user.empresas) {
      throw new ForbiddenException(
        'Usuário não possui empresas ou permissões suficientes.',
      );
    }

    if (!empresaId) {
      throw new ForbiddenException(
        'O ID da empresa (x-empresa-id) deve ser informado no header para validar as permissões.',
      );
    }

    const vinculoEmpresa = user.empresas.find((e: any) => e.id === empresaId);

    if (!vinculoEmpresa || !vinculoEmpresa.perfis) {
      throw new ForbiddenException(
        'Usuário não possui acesso a esta empresa ou não possui perfis vinculados.',
      );
    }

    // Attach company context to request for use in controllers/decorators
    (request as any).empresaContext = vinculoEmpresa;

    const requiredPermissoesArray = Array.isArray(requiredPermissoes)
      ? requiredPermissoes
      : [requiredPermissoes];

    const hasPermissao = vinculoEmpresa.perfis.some((perfil: any) => {
      return perfil.permissoes?.some((permissao: any) => {
        return requiredPermissoesArray.includes(permissao.codigo);
      });
    });

    if (!hasPermissao) {
      throw new ForbiddenException(
        'Usuário não possui permissões suficientes para acessar este recurso nesta empresa.',
      );
    }

    return true;
  }
}
