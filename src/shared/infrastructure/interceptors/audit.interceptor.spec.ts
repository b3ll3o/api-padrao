// TDD: AGENTS.md §4 — AuditInterceptor é global; se parar de logar, perdemos auditoria sem aviso.
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { of, Observable } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AUDIT_QUEUE } from '../queues/queue.constants';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let reflector: Reflector;
  let mockAuditQueue: { add: jest.Mock };
  let mockPrisma: { outboxEvent: { create: jest.Mock } };

  // Helper: aguarda microtasks pendentes (Promise do auditQueue.add) e
  // o `setImmediate` (se ainda houver no caminho assíncrono) serem
  // processados. Mantemos por compat com versão síncrona anterior.
  const flushImmediates = () =>
    new Promise<void>((resolve) => setImmediate(resolve));

  const buildContext = (req: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => ({}) as any,
      getClass: () => ({}) as any,
      getArgs: () => [] as any,
      getArgByIndex: () => undefined,
      switchToRpc: () => ({}) as any,
      switchToWs: () => ({}) as any,
      getType: () => 'http' as any,
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    mockAuditQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    mockPrisma = {
      outboxEvent: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditInterceptor,
        Reflector,
        { provide: getQueueToken(AUDIT_QUEUE), useValue: mockAuditQueue },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    interceptor = module.get(AuditInterceptor);
    reflector = module.get(Reflector);
    jest.clearAllMocks();
  });

  it('deve ser definido', () => {
    expect(interceptor).toBeInstanceOf(AuditInterceptor);
  });

  it('NÃO deve enfileirar quando não há @Auditar() no handler', async () => {
    // Sem metadata → passa direto
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const next: CallHandler = { handle: () => of({ id: 1 }) };
    interceptor.intercept(buildContext({}), next).subscribe();
    await flushImmediates();
    expect(mockAuditQueue.add).not.toHaveBeenCalled();
  });

  it('deve enfileirar na fila AUDIT após resposta bem-sucedida quando @Auditar() presente', async () => {
    const auditOptions = { acao: 'CREATE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);

    const req = {
      method: 'POST',
      url: '/usuarios',
      body: { email: 'a@b.com' },
      params: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
      usuarioLogado: { sub: 1, email: 'a@b.com' },
    };
    const next: CallHandler = { handle: () => of({ id: 42 }) };

    interceptor.intercept(buildContext(req), next).subscribe();
    await flushImmediates();

    expect(mockAuditQueue.add).toHaveBeenCalledWith(
      'audit-log',
      expect.objectContaining({
        usuarioId: 1,
        acao: 'CREATE',
        recurso: 'usuario',
        recursoId: '42', // data.id → string
        ip: '127.0.0.1',
        userAgent: 'jest',
      }),
      expect.objectContaining({
        attempts: 3,
        backoff: expect.objectContaining({ type: 'exponential' }),
        removeOnComplete: expect.objectContaining({ age: 86400 }),
        removeOnFail: expect.objectContaining({ age: 604800 }),
      }),
    );
  });

  it('deve sanitizar campos sensíveis no body (senha, password, token, secret)', async () => {
    const auditOptions = { acao: 'CREATE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);

    const req = {
      method: 'POST',
      url: '/usuarios',
      body: { email: 'a@b.com', senha: 'Password123!', refreshToken: 'uuid' },
      params: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
      usuarioLogado: { sub: 1 },
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(buildContext(req), next).subscribe();
    await flushImmediates();

    const jobData = mockAuditQueue.add.mock.calls[0][1];
    const detalhes = jobData.detalhes;
    // [SEC-LGPD-001] email agora é PII — DEVE ser mascarado.
    expect(detalhes.body.email).toBe('********');
    expect(detalhes.body.senha).toBe('********');
    expect(detalhes.body.refreshToken).toBe('********');
  });

  // [PERF-001] Match exato (Set lookup O(1)) em vez de substring. Campos
  // como `tokenType` ou `userIdentifier` NÃO devem ser mascarados.
  it('NÃO deve mascarar campos que apenas CONTÊM palavras sensíveis no nome (tokenType, userIdentifier)', async () => {
    const auditOptions = { acao: 'CREATE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);

    const req = {
      method: 'POST',
      url: '/usuarios',
      body: {
        email: 'a@b.com',
        tokenType: 'bearer',
        userIdentifier: 'abc',
      },
      params: {},
      ip: '127.0.0.1',
      headers: {},
      usuarioLogado: { sub: 1 },
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(buildContext(req), next).subscribe();
    await flushImmediates();

    const jobData = mockAuditQueue.add.mock.calls[0][1];
    const detalhes = jobData.detalhes;
    expect(detalhes.body.tokenType).toBe('bearer');
    expect(detalhes.body.userIdentifier).toBe('abc');
  });

  // [SEC-LGPD-001] Campos PII brasileiros DEVEM ser mascarados
  // antes de ir para o log de auditoria (LGPD Art. 5º, IV).
  it('deve mascarar PII brasileiras: cpf/cnpj/telefone/email/endereco/cep/rg', async () => {
    const auditOptions = { acao: 'CREATE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);

    const req = {
      method: 'POST',
      url: '/usuarios',
      body: {
        cpf: '123.456.789-00',
        cnpj: '12.345.678/0001-00',
        telefone: '(11) 99999-9999',
        celular: '(11) 98888-8888',
        email: 'a@b.com',
        endereco: 'Rua A, 123',
        cep: '01234-567',
        rg: '12.345.678-9',
        pis: '123.45678.90-1',
        nome: 'João Silva', // não-PII, deve permanecer
      },
      params: {},
      ip: '127.0.0.1',
      headers: {},
      usuarioLogado: { sub: 1 },
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(buildContext(req), next).subscribe();
    await flushImmediates();

    const jobData = mockAuditQueue.add.mock.calls[0][1];
    const body = jobData.detalhes.body;
    expect(body.cpf).toBe('********');
    expect(body.cnpj).toBe('********');
    expect(body.telefone).toBe('********');
    expect(body.celular).toBe('********');
    expect(body.email).toBe('********');
    expect(body.endereco).toBe('********');
    expect(body.cep).toBe('********');
    expect(body.rg).toBe('********');
    expect(body.pis).toBe('********');
    expect(body.nome).toBe('João Silva');
  });

  it('deve usar params.id como recursoId quando data.id ausente', async () => {
    const auditOptions = { acao: 'DELETE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);

    const req = {
      method: 'DELETE',
      url: '/usuarios/7',
      body: {},
      params: { id: '7' },
      ip: '127.0.0.1',
      headers: {},
      usuarioLogado: { sub: 1 },
    };
    const next: CallHandler = { handle: () => of({}) };

    interceptor.intercept(buildContext(req), next).subscribe();
    await flushImmediates();

    expect(mockAuditQueue.add).toHaveBeenCalledWith(
      'audit-log',
      expect.objectContaining({ recursoId: '7' }),
      expect.any(Object),
    );
  });

  // [REQ-QUEUE-001] Falha de enqueue (Redis down) NÃO propaga — degrada aberta.
  it('NÃO deve propagar erro do enqueue (catch interno)', async () => {
    const auditOptions = { acao: 'CREATE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);
    mockAuditQueue.add.mockRejectedValue(new Error('Redis down'));

    const req = {
      method: 'POST',
      url: '/usuarios',
      body: {},
      params: {},
      ip: '127.0.0.1',
      headers: {},
      usuarioLogado: { sub: 1 },
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    // Não deve lançar — o catch interno silencia
    expect(() =>
      interceptor.intercept(buildContext(req), next).subscribe(),
    ).not.toThrow();
    // Aguarda o setImmediate e a rejeição do Promise serem processados
    await flushImmediates();
    // O add foi chamado (e falhou silenciosamente)
    expect(mockAuditQueue.add).toHaveBeenCalled();
  });

  it('deve extrair usuarioId de request.user.userId (fallback)', async () => {
    const auditOptions = { acao: 'CREATE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);

    const req = {
      method: 'POST',
      url: '/usuarios',
      body: {},
      params: {},
      ip: '127.0.0.1',
      headers: {},
      user: { userId: 99, email: 'a@b.com' }, // sem usuarioLogado
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(buildContext(req), next).subscribe();
    await flushImmediates();

    expect(mockAuditQueue.add).toHaveBeenCalledWith(
      'audit-log',
      expect.objectContaining({ usuarioId: 99 }),
      expect.any(Object),
    );
  });

  // [REQ-QUEUE-001] Garante que a opção `attempts` está alinhada com a
  // estratégia de retry (3 tentativas antes de desistir/DLQ).
  it('deve enfileirar com attempts=3 e backoff exponencial', async () => {
    const auditOptions = { acao: 'CREATE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);

    const req = {
      method: 'POST',
      url: '/usuarios',
      body: {},
      params: {},
      ip: '127.0.0.1',
      headers: {},
      usuarioLogado: { sub: 1 },
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(buildContext(req), next).subscribe();
    await flushImmediates();

    expect(mockAuditQueue.add).toHaveBeenCalledWith(
      'audit-log',
      expect.any(Object),
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    );
  });

  // [REQ-QUEUE-001] Job NÃO é enfileirado se o handler lançar
  // (tap só roda em respostas de sucesso do observable).
  it('NÃO deve enfileirar se o handler lançar erro (rxjs tap roda só em next)', async () => {
    const auditOptions = { acao: 'CREATE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);

    const req = {
      method: 'POST',
      url: '/usuarios',
      body: {},
      params: {},
      ip: '127.0.0.1',
      headers: {},
      usuarioLogado: { sub: 1 },
    };
    const error = new Error('boom');
    // Observable emitindo erro: tap NÃO é chamado (tap só roda em next).
    const next: CallHandler = {
      handle: () =>
        new Observable((sub: { error: (e: unknown) => void }) => {
          sub.error(error);
        }),
    };

    interceptor.intercept(buildContext(req), next).subscribe({
      error: () => {
        // silencioso
      },
    });
    await flushImmediates();

    expect(mockAuditQueue.add).not.toHaveBeenCalled();
    // [B1] Outbox também NÃO deve ser gravado em caso de erro.
    expect(mockPrisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  // [B1] Outbox: SEMPRE grava no outbox para durabilidade.
  // Mesmo se o enqueue do BullMQ falhar, o evento está no DB.
  it('[B1] deve gravar no outbox (outboxEvent.create) após resposta de sucesso', async () => {
    const auditOptions = { acao: 'CREATE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);

    const req = {
      method: 'POST',
      url: '/usuarios',
      body: { nome: 'Alice' },
      params: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
      usuarioLogado: { sub: 1 },
    };
    const next: CallHandler = { handle: () => of({ id: 99 }) };

    interceptor.intercept(buildContext(req), next).subscribe();
    await flushImmediates();

    expect(mockPrisma.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'audit',
        payload: expect.objectContaining({
          acao: 'CREATE',
          recurso: 'usuario',
          recursoId: '99',
          usuarioId: 1,
        }),
      },
    });
  });

  // [B1] Outbox: falha ao gravar no DB NÃO propaga (degrada aberta).
  it('[B1] NÃO deve propagar erro quando outbox.create falha (DB offline)', async () => {
    const auditOptions = { acao: 'CREATE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);
    mockPrisma.outboxEvent.create.mockRejectedValue(new Error('DB offline'));

    const req = {
      method: 'POST',
      url: '/usuarios',
      body: {},
      params: {},
      ip: '127.0.0.1',
      headers: {},
      usuarioLogado: { sub: 1 },
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    // Não deve lançar — auditoria é observacional.
    expect(() =>
      interceptor.intercept(buildContext(req), next).subscribe(),
    ).not.toThrow();
    await flushImmediates();
    expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
    // BullMQ add continua sendo tentado (caminho quente, independente).
    expect(mockAuditQueue.add).toHaveBeenCalled();
  });

  // [B1] Outbox + best-effort enqueue: ambos rodam em paralelo.
  it('[B1] outbox.create e auditQueue.add devem ser chamados independentemente', async () => {
    const auditOptions = { acao: 'CREATE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);

    const req = {
      method: 'POST',
      url: '/usuarios',
      body: {},
      params: {},
      ip: '127.0.0.1',
      headers: {},
      usuarioLogado: { sub: 1 },
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(buildContext(req), next).subscribe();
    await flushImmediates();

    expect(mockPrisma.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(mockAuditQueue.add).toHaveBeenCalledTimes(1);
  });
});
