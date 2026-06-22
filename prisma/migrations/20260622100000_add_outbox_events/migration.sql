-- [B1] Outbox pattern real — tabela `outbox_events` para garantir
-- entrega atômica de eventos assíncronos (audit, email, refresh-flush)
-- SEM dependência de Redis up-time entre o commit do DB e o enqueue.
--
-- Padrão: Transactional Outbox.
-- - Produtor (AuditInterceptor, EmailProducer, etc.) grava nesta tabela
--   DENTRO da mesma transação da operação de negócio (ou, no caso do
--   interceptor, no melhor momento possível — ver nota no processor).
-- - Poller (OutboxPollerService) faz `SELECT WHERE publishedAt IS NULL`
--   periodicamente e enfileira jobs na fila correta.
-- - OutboxProcessor marca `publishedAt` quando o publish é confirmado.
--
-- Por que DB-only e não Redis?
--   Redis pode cair (já aconteceu em produção neste projeto). Sem o
--   outbox, se o processo morre entre `tx.commit()` e `queue.add()`, o
--   evento é perdido para sempre. Aqui, o evento está no Postgres
--   (transactional), e o poller reenvia até publishedAt != null.
--
-- Índices:
--   - (publishedAt, scheduledFor): hot-path do poller (busca eventos
--     pendentes cujo retry-backoff já passou).
--   - (type, publishedAt): filtra por tipo de evento (útil para
--     dashboards / purga específica).

CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL,
  "type" VARCHAR(50) NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "scheduledFor" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- Hot-path do poller: pendentes cujo retry-backoff já passou.
CREATE INDEX "outbox_events_publishedAt_scheduledFor_idx"
  ON "outbox_events"("publishedAt", "scheduledFor");

-- Filtro por tipo (purgas, dashboards, reprocessamento).
CREATE INDEX "outbox_events_type_publishedAt_idx"
  ON "outbox_events"("type", "publishedAt");