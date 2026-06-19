import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { PrismaService } from '../../../prisma/prisma.service';

// TDD: AGENTS.md §4 — AuditInterceptor é global; se parar de logar, perdemos auditoria sem aviso.

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let reflector: Reflector;
  let mockPrisma: { auditLog: { create: jest.Mock } };

  // [PERF-002] Helper: aguarda o `setImmediate` (que desacopla a
  // escrita do audit log do event loop da resposta) ser processado.
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
    mockPrisma = {
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditInterceptor,
        Reflector,
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

  it('NÃO deve logar quando não há @Auditar() no handler', async () => {
    // Sem metadata → passa direto
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const next: CallHandler = { handle: () => of({ id: 1 }) };
    interceptor.intercept(buildContext({}), next).subscribe();
    await flushImmediates();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('deve logar no Prisma após resposta bem-sucedida quando @Auditar() presente', async () => {
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

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          usuarioId: 1,
          acao: 'CREATE',
          recurso: 'usuario',
          recursoId: '42', // data.id → string
          ip: '127.0.0.1',
          userAgent: 'jest',
        }),
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

    const call = mockPrisma.auditLog.create.mock.calls[0][0];
    const detalhes = call.data.detalhes;
    expect(detalhes.body.email).toBe('a@b.com');
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

    const call = mockPrisma.auditLog.create.mock.calls[0][0];
    const detalhes = call.data.detalhes;
    expect(detalhes.body.tokenType).toBe('bearer');
    expect(detalhes.body.userIdentifier).toBe('abc');
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

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recursoId: '7' }),
      }),
    );
  });

  it('NÃO deve propagar erro de auditoria (catch interno)', async () => {
    const auditOptions = { acao: 'CREATE', recurso: 'usuario' };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(auditOptions);
    mockPrisma.auditLog.create.mockRejectedValue(new Error('DB down'));

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
    interceptor.intercept(buildContext(req), next).subscribe();
    // Aguarda o setImmediate e a rejeição do Promise serem processados
    await flushImmediates();
    // O create foi chamado (e falhou silenciosamente)
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
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

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ usuarioId: 99 }),
      }),
    );
  });
});
