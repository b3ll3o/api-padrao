// TDD: src/shared/infrastructure/queues/queue.constants.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-QUEUE-001..005
import {
  AUDIT_QUEUE,
  DEFAULT_JOB_OPTIONS,
  EMAIL_QUEUE,
  REFRESH_FLUSH_QUEUE,
} from './queue.constants';

describe('queue.constants', () => {
  it('deve expor nomes de filas estáveis (string literals)', () => {
    expect(EMAIL_QUEUE).toBe('email');
    expect(AUDIT_QUEUE).toBe('audit');
    expect(REFRESH_FLUSH_QUEUE).toBe('refresh-flush');
  });

  it('nomes de filas devem ser distintos (sem colisão de routing key)', () => {
    const all = [EMAIL_QUEUE, AUDIT_QUEUE, REFRESH_FLUSH_QUEUE];
    expect(new Set(all).size).toBe(all.length);
  });

  it('DEFAULT_JOB_OPTIONS deve configurar retry/backoff apropriados', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.backoff.type).toBe('exponential');
    expect(DEFAULT_JOB_OPTIONS.backoff.delay).toBe(1000);
    // removeOnComplete=true: libera Redis (jobs completos não persistem)
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toBe(true);
    // removeOnFail=false: jobs falhos ficam no Redis para inspeção/Bull Board
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toBe(false);
  });
});
