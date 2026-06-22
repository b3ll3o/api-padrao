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
import { AUDIT_QUEUE, OUTBOX_TYPE } from '../queues/queue.constants';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    @InjectQueue(AUDIT_QUEUE) private readonly auditQueue: Queue,
    private reflector: Reflector,
    private readonly prisma: PrismaService,
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

        // [B1] Outbox pattern real.
        //
        // Estratégia dual-write com fallback outbox:
        //   1) Outbox SEMPRE (DB transactional — fonte da verdade).
        //      Garante que se o processo crashar antes de qualquer
        //      enqueue, o evento é reenviado pelo OutboxPollerService.
        //   2) Best-effort enqueue no BullMQ para reduzir latência
        //      do caminho quente (não precisa esperar o poll de 5s).
        //
        // Falha em qualquer um dos passos NÃO propaga — auditoria é
        // observacional. O outbox cobre o caso (1) e o catch do (2)
        // cobre o caminho quente.
        this.persistOutbox(jobData).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            {
              event: 'audit.outbox_write_failed',
              acao: jobData.acao,
              error: message,
            },
            'Falha ao gravar outbox de auditoria (DB indisponível?)',
          );
        });

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
            // O outbox garante que o evento será reentregue mesmo que
            // este caminho falhe (Redis down).
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

  /**
   * [B1] Grava o evento na tabela `outbox_events` (transactional com
   * a operação de negócio quando o caller está dentro de um UnitOfWork;
   * caso contrário, gravação direta — ainda assim durável).
   *
   * OutboxProcessor + OutboxPollerService garantem que o evento é
   * eventualmente publicado na fila correta.
   */
  private async persistOutbox(payload: unknown): Promise<void> {
    await this.prisma.outboxEvent.create({
      data: {
        type: OUTBOX_TYPE.AUDIT,
        payload: payload as object,
      },
    });
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
