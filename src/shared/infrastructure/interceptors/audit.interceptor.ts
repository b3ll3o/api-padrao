// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/shared/infrastructure/interceptors/audit.interceptor.spec.ts

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
import { Prisma } from '@prisma/client';
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

  // [PERF-001] Conjunto EXATO de chaves sensíveis. Antes era match por
  // substring (`key.includes('token')`), o que mascarava indevidamente
  // campos legítimos como `tokenType`, `tokenVersion`, `userIdentifier`.
  // [SEC-LGPD-001] Lista inclui PII brasileiras (LGPD Art. 5º, IV):
  // cpf/cnpj/telefone/email/endereco/cep/rg. Vazamento em log de
  // auditoria é infração (multa + dano reputacional).
  private static readonly SENSITIVE_KEYS = new Set([
    'senha',
    'password',
    'token',
    'secret',
    'refreshtoken',
    'accesstoken',
    // PII brasileira — LGPD
    'cpf',
    'cnpj',
    'telefone',
    'celular',
    'email',
    'endereco',
    'cep',
    'rg',
    'pis',
  ]);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
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

    // [PERF-002] `setImmediate` descola a escrita do log do event loop da
    // resposta HTTP. Sem isso, `await this.prisma.auditLog.create(...)`
    // no `tap` mantém o request em vôo até o INSERT do log terminar —
    // adiciona ~5-20ms em TODA request auditada (e.g. POST /usuarios).
    // `setImmediate` é mais adequado que `setTimeout(0)` porque agenda
    // no checkpoint do event loop, antes de timers e I/O.
    return next.handle().pipe(
      tap((data: unknown) => {
        // Snapshot imutável: nada aqui deve mudar entre o schedule e
        // a execução do callback.
        const payload: Prisma.AuditLogUncheckedCreateInput = {
          usuarioId: (user?.userId || user?.sub) as number | undefined,
          acao: auditOptions.acao,
          recurso: auditOptions.recurso,
          recursoId: params?.id || (data as { id?: unknown })?.id?.toString(),
          detalhes: {
            method,
            url,
            // Ocultamos campos sensíveis por segurança se estiverem no body
            ...(body && {
              body: AuditInterceptor.sanitizeBody(
                body as Record<string, unknown>,
              ),
            }),
          } as Prisma.InputJsonValue,
          ip,
          userAgent,
        };
        setImmediate(() => {
          this.prisma.auditLog.create({ data: payload }).catch(() => {
            // [MED-002] Falha de auditoria NÃO propaga — auditoria é
            // um efeito observacional, não parte do contrato da API.
            this.logger.warn(
              { event: 'audit.write_failed', acao: payload.acao },
              'Falha ao salvar log de auditoria',
            );
          });
        });
      }),
    );
  }

  private static sanitizeBody(
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = { ...body };
    for (const key of Object.keys(sanitized)) {
      if (AuditInterceptor.SENSITIVE_KEYS.has(key.toLowerCase())) {
        sanitized[key] = '********';
      }
    }
    return sanitized;
  }
}
