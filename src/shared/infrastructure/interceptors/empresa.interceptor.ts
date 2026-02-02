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
  private readonly logger = new Logger(EmpresaInterceptor.name);

  constructor(private readonly empresaContext: EmpresaContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    try {
      const request = context.switchToHttp().getRequest();
      const user = request.user;

      if (user) {
        this.logger.debug(`Usuário logado encontrado: ${user.sub}`);
        this.empresaContext.usuarioId = user.sub;

        // Extrai empresaId do header ou do JWT
        const empresaId = request.headers['x-empresa-id'] || user.empresaId;
        this.logger.debug(`EmpresaId extraído: ${empresaId}`);

        if (empresaId) {
          this.empresaContext.empresaId = empresaId as string;
        }
      } else {
        this.logger.debug('Nenhum usuário logado na requisição');
      }
    } catch (err) {
      this.logger.error('EmpresaInterceptor crash:', err);
    }

    return next.handle();
  }
}
