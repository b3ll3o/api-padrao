import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { EmpresaContext } from '../services/empresa-context.service';

@Injectable()
export class EmpresaInterceptor implements NestInterceptor {
  constructor(private readonly empresaContext: EmpresaContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user) {
      this.empresaContext.usuarioId = user.sub;

      // Extrai empresaId do header ou do JWT
      const empresaId = request.headers['x-empresa-id'] || user.empresaId;

      if (empresaId) {
        this.empresaContext.empresaId = empresaId as string;
      }
    }

    return next.handle();
  }
}
