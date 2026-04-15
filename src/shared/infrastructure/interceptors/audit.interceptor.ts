import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AUDIT_KEY,
  AuditOptions,
} from '../../application/decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditOptions = this.reflector.getAllAndOverride<AuditOptions>(
      AUDIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.usuarioLogado || request.user;
    const { method, url, body, params, ip } = request;
    const userAgent = request.headers['user-agent'];

    return next.handle().pipe(
      tap(async (data) => {
        try {
          await this.prisma.auditLog.create({
            data: {
              usuarioId: user?.userId || user?.sub,
              acao: auditOptions.acao,
              recurso: auditOptions.recurso,
              recursoId: params?.id || data?.id?.toString(),
              detalhes: {
                method,
                url,
                // Ocultamos senhas por segurança se estiverem no body
                body: body ? this.sanitizeBody(body) : undefined,
              },
              ip,
              userAgent,
            },
          });
        } catch {
          this.logger.warn('Falha ao salvar log de auditoria');
        }
      }),
    );
  }

  private sanitizeBody(body: any) {
    const sanitized = { ...body };
    const sensitiveKeys = ['senha', 'password', 'token', 'secret'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        sanitized[key] = '********';
      }
    }
    return sanitized;
  }
}
