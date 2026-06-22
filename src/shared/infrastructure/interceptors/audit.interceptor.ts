// BDD: features/auditoria.feature:Cenário: Eventos de auditoria processados assincronamente
// SDD: .openspec/changes/observabilidade/design.md:REQ-QUEUE-001..005
// TDD: src/shared/infrastructure/interceptors/audit.interceptor.spec.ts

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  AUDIT_KEY,
  AuditOptions,
} from '../../application/decorators/audit.decorator';
import { AUDIT_QUEUE } from '../queues/queue.constants';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    @InjectQueue(AUDIT_QUEUE) private readonly auditQueue: Queue,
    private reflector: Reflector,
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

    return next.handle().pipe(
      tap((data: unknown) => {
        // Payload alinhado com `AuditJobData` (audit.processor.ts).
        const recursoId =
          params?.id || (data as { id?: unknown })?.id?.toString();

        const jobData = {
          acao: auditOptions.acao,
          usuarioId: (user?.userId || user?.sub) as number | undefined,
          recurso: auditOptions.recurso,
          recursoId,
          detalhes: {
            method,
            url,
            // Ocultamos campos sensíveis por segurança se estiverem no body
            ...(body && {
              body: AuditInterceptor.sanitizeBody(
                body as Record<string, unknown>,
              ),
            }),
          },
          ip,
          userAgent,
        };

        // [REQ-QUEUE-001] Enfileira no BullMQ — não-bloqueante e durável
        // (Redis). Substitui a escrita síncrona direta no Prisma que
        // estava acoplada ao event loop do request (PERF-002).
        //
        // Opções do job:
        //   - attempts: 3 (override do DEFAULT_JOB_OPTIONS — auditoria é
        //     crítica e toleramos retentativas extras antes de desistir)
        //   - backoff: exponencial 1s → 2s → 4s
        //   - removeOnComplete: 24h OU 1000 jobs (mantém rastro curto
        //     para auditoria de jobs completos, evita crescimento
        //     ilimitado do Redis)
        //   - removeOnFail: 7 dias para inspeção via Bull Board
        //
        // Degrada aberta: falha no enqueue (Redis down) NÃO quebra o
        // request — apenas logamos warning. Auditoria é observacional.
        this.auditQueue
          .add('audit-log', jobData, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { age: 86400, count: 1000 },
            removeOnFail: { age: 604800 },
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            // [MED-002] Falha de enqueue NÃO propaga — auditoria é
            // um efeito observacional, não parte do contrato da API.
            this.logger.warn(
              {
                event: 'audit.enqueue_failed',
                acao: jobData.acao,
                error: message,
              },
              'Falha ao enfileirar log de auditoria (Redis indisponível?)',
            );
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
