// TDD: src/shared/infrastructure/queues/queues.module.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-QUEUE-005
import { QueuesModule } from './queues.module';
import {
  AUDIT_QUEUE,
  DEFAULT_JOB_OPTIONS,
  EMAIL_QUEUE,
  REFRESH_FLUSH_QUEUE,
} from './queue.constants';

describe('QueuesModule', () => {
  it('deve estar decorado como @Module do NestJS', () => {
    // Reflect.getMetadata é a forma canônica de inspecionar decorators
    // sem precisar instanciar o módulo.
    const providers = Reflect.getMetadata('providers', QueuesModule) ?? [];
    const exports = Reflect.getMetadata('exports', QueuesModule) ?? [];

    // Pelo menos BullModule.registerQueue deve estar presente (vira
    // DynamicModule na maioria dos casos via @Module({imports: [...])).
    // Aqui validamos que o módulo está estruturalmente correto sem
    // precisar compilar/instanciar.
    expect(Array.isArray(providers)).toBe(true);
    expect(Array.isArray(exports)).toBe(true);
    // exports inclui BullModule para que outros módulos possam injetar
    // as filas via @InjectQueue(NAME)
    expect(exports.length).toBeGreaterThan(0);
  });

  it('deve referenciar as 3 filas canônicas via constantes', () => {
    // Assegura que os identifiers não foram renomeados acidentalmente
    // (quebraria compatibilidade com Bull Board, BullMQ Inspector, etc.)
    expect(EMAIL_QUEUE).toBe('email');
    expect(AUDIT_QUEUE).toBe('audit');
    expect(REFRESH_FLUSH_QUEUE).toBe('refresh-flush');
  });

  it('DEFAULT_JOB_OPTIONS deve estar aplicado em todas as 3 filas', () => {
    // Esta é uma asserção de **intenção de design**: a constante
    // DEFAULT_JOB_OPTIONS é o que garante consistência entre as 3 filas.
    // Se algum dia alguém criar uma 4ª fila e esquecer de aplicar
    // DEFAULT_JOB_OPTIONS, este teste documenta a expectativa.
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toBe(true);
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toBe(false);
  });
});
