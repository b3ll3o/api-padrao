// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/shared/infrastructure/interceptors/empresa.interceptor.spec.ts

import {
  ForbiddenException,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { EmpresaContext } from '../services/empresa-context.service';
import { contextStorage, IRequestContext } from '../services/context.storage';
import { AuthorizationService } from '../../domain/services/authorization.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EmpresaInterceptor implements NestInterceptor {
  private static readonly logger = new Logger(EmpresaInterceptor.name);

  constructor(
    private readonly empresaContext: EmpresaContext,
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const contextData: IRequestContext = {
      requestId: (request.headers['x-request-id'] as string) || uuidv4(),
    };

    if (user) {
      EmpresaInterceptor.logger.debug(`Usuário logado encontrado: ${user.sub}`);
      contextData.usuarioId = user.sub;

      // [SEC-005] Cross-check `x-empresa-id` (header) contra o tenant
      // vinculado no JWT. Sem isso, um usuário da empresa A poderia
      // enviar `x-empresa-id: B` e ter o EmpresaContext populado com
      // B (afetando logs, throttler, audit) — mesmo em rotas públicas
      // que não passam pelo PermissaoGuard. Admins globais podem
      // alternar entre tenants legitimamente.
      const headerEmpresaId = request.headers['x-empresa-id'] as
        | string
        | undefined;
      const isGlobalAdmin = this.authorization.isAdmin(user);

      if (headerEmpresaId && user.empresaId && !isGlobalAdmin) {
        // JWT sem `empresas[]` cai no fallback PermissaoGuard
        // (que já valida `user.empresas.some(e => e.id === header)`).
        // Aqui protegemos o caso em que o usuário tem empresaId
        // primário no JWT mas envia header de outro tenant.
        if (headerEmpresaId !== user.empresaId) {
          EmpresaInterceptor.logger.warn(
            `SEC-005 IDOR bloqueado: user.sub=${user.sub} tenant JWT=${user.empresaId} tentou acessar tenant header=${headerEmpresaId}`,
          );
          return new Observable((subscriber) => {
            subscriber.error(
              new ForbiddenException(
                'O header x-empresa-id não corresponde ao tenant do token JWT.',
              ),
            );
          });
        }
      }

      // Extrai empresaId do header (já validado) ou do JWT
      const empresaId = headerEmpresaId || user.empresaId;
      EmpresaInterceptor.logger.debug(`EmpresaId extraído: ${empresaId}`);

      if (empresaId) {
        contextData.empresaId = empresaId as string;
      }
    } else {
      EmpresaInterceptor.logger.debug('Nenhum usuário logado na requisição');
    }

    return new Observable((subscriber) => {
      contextStorage.run(contextData, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
