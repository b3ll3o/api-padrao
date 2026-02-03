import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { EmpresaContext } from '../services/empresa-context.service';

@Injectable()
export class EmpresaInterceptor implements NestInterceptor {
  private static readonly logger = new Logger(EmpresaInterceptor.name);

  constructor(private readonly empresaContext: EmpresaContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    try {
      // Check if empresaContext is available (it might not be in some test scenarios)
      if (!this.empresaContext) {
        EmpresaInterceptor.logger.warn(
          'EmpresaContext not available, skipping context setup',
        );
        return next.handle();
      }

      const request = context.switchToHttp().getRequest();
      const user = request.user;

      if (user) {
        EmpresaInterceptor.logger.debug(
          `Usuário logado encontrado: ${user.sub}`,
        );
        this.empresaContext.usuarioId = user.sub;

        // Extrai empresaId do header ou do JWT
        const empresaId = request.headers['x-empresa-id'] || user.empresaId;
        EmpresaInterceptor.logger.debug(`EmpresaId extraído: ${empresaId}`);

        if (empresaId) {
          this.empresaContext.empresaId = empresaId as string;
        }
      } else {
        EmpresaInterceptor.logger.debug('Nenhum usuário logado na requisição');
      }
    } catch (err) {
      EmpresaInterceptor.logger.error(
        'EmpresaInterceptor crash',
        err instanceof Error ? err.stack : String(err),
      );
    }

    return next.handle();
  }
}
