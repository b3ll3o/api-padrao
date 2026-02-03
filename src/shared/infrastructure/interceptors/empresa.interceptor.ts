import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { EmpresaContext } from '../services/empresa-context.service';
import { contextStorage, IRequestContext } from '../services/context.storage';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EmpresaInterceptor implements NestInterceptor {
  private static readonly logger = new Logger(EmpresaInterceptor.name);

  constructor(private readonly empresaContext: EmpresaContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const contextData: IRequestContext = {
      requestId: (request.headers['x-request-id'] as string) || uuidv4(),
    };

    if (user) {
      EmpresaInterceptor.logger.debug(`Usuário logado encontrado: ${user.sub}`);
      contextData.usuarioId = user.sub;

      // Extrai empresaId do header ou do JWT
      const empresaId = request.headers['x-empresa-id'] || user.empresaId;
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
