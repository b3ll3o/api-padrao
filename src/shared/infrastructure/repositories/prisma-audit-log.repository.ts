// BDD: features/observabilidade.feature:Cenário: Logs de auditoria acessíveis via cursor
// SDD: .openspec/changes/observabilidade/design.md:REQ-AUDIT-READ-001
// TDD: src/shared/infrastructure/repositories/prisma-audit-log.repository.spec.ts
//
// Adapter Prisma para leitura paginada de AuditLog.
//
// [PERF-CURSOR-001] — Para tabelas com expectativa de > 10k linhas
// (audit logs), OFFSET/LIMIT degrada linearmente (o banco precisa
// varrer e descartar N linhas anteriores). Cursor pagination usa o
// índice `createdAt` para um seek direto na última posição conhecida
// (`lt: cursor`) — O(log N) em vez de O(N).
//
// [REQ-AUDIT-READ-001] — Estratégia `take + 1` para detectar se há
// próxima página sem uma segunda query de count. Se retornarmos
// `limit + 1` itens, sabemos que há mais e descartamos o último antes
// de devolver. Caso contrário, `nextCursor = null` sinaliza fim.
//
// O cursor é uma string ISO-8601 do `createdAt` do último item
// devolvido. Usar timestamp (em vez de UUID) é compatível com a
// ordenação `desc` por `createdAt` e permite reuso de índices existentes.

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

export interface AuditLogCursorPage {
  items: AuditLogItem[];
  nextCursor: string | null;
}

export interface AuditLogItem {
  id: string;
  usuarioId: number | null;
  acao: string;
  recurso: string;
  recursoId: string | null;
  detalhes: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AuditLogQueryOptions {
  /** ISO-8601 timestamp do último item da página anterior */
  cursor?: string;
  /** Quantidade de itens por página (default 50, max 200) */
  limit?: number;
  /** Filtro opcional por código de ação (ex.: 'usuario.create') */
  acao?: string;
  /** Filtro opcional por ID do usuário que executou a ação */
  usuarioId?: number;
  /** Filtro opcional por recurso (ex.: 'usuario:42') */
  recurso?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Injectable()
export class PrismaAuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    options: AuditLogQueryOptions = {},
  ): Promise<AuditLogCursorPage> {
    // [DOS-AUDIT-001] — `Max(MAX_LIMIT)` no application layer espelha
    // a mesma defesa do PaginationDto. Audit logs podem crescer rápido
    // e serializar muitos MB de JSONB se um cliente pedir 100k.
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const where = {
      ...(options.usuarioId !== undefined && { usuarioId: options.usuarioId }),
      ...(options.acao !== undefined && { acao: options.acao }),
      ...(options.recurso !== undefined && { recurso: options.recurso }),
      ...(options.cursor !== undefined && {
        // Strict-less-than garante estrita monotonicidade descendente
        // e nunca devolve o mesmo item em duas páginas.
        createdAt: { lt: new Date(options.cursor) },
      }),
    };

    // [REQ-AUDIT-READ-001] — `take: limit + 1` para detectar se há mais
    // páginas sem segunda query. O índice `@@index([recurso, recursoId])`
    // e o filtro por `createdAt` permitem seek direto em >10k rows.
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasNext = rows.length > limit;
    const items = (hasNext ? rows.slice(0, limit) : rows).map((row) => ({
      id: row.id,
      usuarioId: row.usuarioId,
      acao: row.acao,
      recurso: row.recurso,
      recursoId: row.recursoId,
      detalhes: row.detalhes,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
    }));

    const nextCursor =
      hasNext && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    return { items, nextCursor };
  }
}
