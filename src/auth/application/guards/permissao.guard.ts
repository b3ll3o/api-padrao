import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { PERMISSAO_KEY } from '../decorators/temPermissao.decorator';
import {
  EmpresaJwtPayload,
  JwtAccessTokenPayload,
  PerfilJwtPayload,
  PermissaoJwtPayload,
} from '../../domain/types/jwt-payload';

/**
 * Estende `FastifyRequest` para carregar o tipo do `usuarioLogado`
 * (anexado pelo `AuthGuard` na deserialização do JWT) e o
 * `empresaContext` (anexado por este guard em runtime).
 */
type AuthenticatedRequest = FastifyRequest & {
  usuarioLogado?: JwtAccessTokenPayload;
  empresaContext?: EmpresaJwtPayload;
};

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

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
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

    const vinculoEmpresa = user.empresas.find(
      (e: EmpresaJwtPayload) => e.id === empresaId,
    );

    if (!vinculoEmpresa || !vinculoEmpresa.perfis) {
      throw new ForbiddenException(
        'Usuário não possui acesso a esta empresa ou não possui perfis vinculados.',
      );
    }

    // Attach company context to request for use in controllers/decorators
    request.empresaContext = vinculoEmpresa;

    const requiredPermissoesArray = Array.isArray(requiredPermissoes)
      ? requiredPermissoes
      : [requiredPermissoes];

    const hasPermissao = vinculoEmpresa.perfis.some(
      (perfil: PerfilJwtPayload) => {
        return perfil.permissoes?.some((permissao: PermissaoJwtPayload) => {
          return requiredPermissoesArray.includes(permissao.codigo);
        });
      },
    );

    if (!hasPermissao) {
      throw new ForbiddenException(
        'Usuário não possui permissões suficientes para acessar este recurso nesta empresa.',
      );
    }

    return true;
  }
}
