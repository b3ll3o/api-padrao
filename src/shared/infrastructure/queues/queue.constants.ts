// BDD: features/email-notifications.feature:Cenário: E-mail enviado assincronamente via queue
// BDD: features/auditoria.feature:Cenário: Eventos de auditoria processados assincronamente
// SDD: .openspec/changes/observabilidade/design.md:REQ-QUEUE-001..005
//
// Nomes das filas BullMQ. Constantes compartilhadas entre Producers e
// Consumers para evitar typos.

export const EMAIL_QUEUE = 'email';
export const AUDIT_QUEUE = 'audit';
export const REFRESH_FLUSH_QUEUE = 'refresh-flush';

// [B1] Outbox pattern — fila interna usada APENAS pelo OutboxProcessor
// e OutboxPollerService. Produtores (AuditInterceptor etc.) gravam
// direto na tabela `outbox_events` (transactional), e o poller
// enfileira jobs `outbox-publish` aqui para roteamento à fila final.
export const OUTBOX_QUEUE = 'outbox';

// Tipos aceitos em `OutboxEvent.type`. Constante para evitar typos e
// facilitar autocomplete.
export const OUTBOX_TYPE = {
  AUDIT: 'audit',
  EMAIL: 'email',
  REFRESH_FLUSH: 'refresh_flush',
} as const;
export type OutboxType = (typeof OUTBOX_TYPE)[keyof typeof OUTBOX_TYPE];

// Default job options — aplicados quando o job é enfileirado sem opções.
// Comportamento:
//   - attempts: 3 (3 tentativas antes de DLQ)
//   - backoff:  exponencial 1s → 2s → 4s (cap em 30s)
//   - removeOnComplete: true (limpa Redis; se precisar de audit, mude para false)
//   - removeOnFail: false (mantém no Redis para inspeção)
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: true,
  removeOnFail: false,
};
