// BDD: features/email-notifications.feature:Cenário: E-mail enviado assincronamente via queue
// BDD: features/auditoria.feature:Cenário: Eventos de auditoria processados assincronamente
// SDD: .openspec/changes/observabilidade/design.md:REQ-QUEUE-001..005
//
// Nomes das filas BullMQ. Constantes compartilhadas entre Producers e
// Consumers para evitar typos.

export const EMAIL_QUEUE = 'email';
export const AUDIT_QUEUE = 'audit';
export const REFRESH_FLUSH_QUEUE = 'refresh-flush';

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
