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
    expect(interceptor).toBeDefined();
  });

  it('NÃO deve logar quando não há @Auditar() no handler', (done) => {
    // Sem metadata → passa direto
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const next: CallHandler = { handle: () => of({ id: 1 }) };
    interceptor.intercept(buildContext({}), next).subscribe({
      complete: () => {
        expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('deve logar no Prisma após resposta bem-sucedida quando @Auditar() presente', (done) => {
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

    interceptor.intercept(buildContext(req), next).subscribe({
      complete: () => {
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
        done();
      },
    });
  });

  it('deve sanitizar campos sensíveis no body (senha, password, token, secret)', (done) => {
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

    interceptor.intercept(buildContext(req), next).subscribe({
      complete: () => {
        const call = mockPrisma.auditLog.create.mock.calls[0][0];
        const detalhes = call.data.detalhes;
        expect(detalhes.body.email).toBe('a@b.com');
        expect(detalhes.body.senha).toBe('********');
        expect(detalhes.body.refreshToken).toBe('********');
        done();
      },
    });
  });

  it('deve usar params.id como recursoId quando data.id ausente', (done) => {
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

    interceptor.intercept(buildContext(req), next).subscribe({
      complete: () => {
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ recursoId: '7' }),
          }),
        );
        done();
      },
    });
  });

  it('NÃO deve propagar erro de auditoria (try/catch interno)', (done) => {
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
    interceptor.intercept(buildContext(req), next).subscribe({
      complete: () => done(), // sucesso mesmo com audit falhando
    });
  });

  it('deve extrair usuarioId de request.user.userId (fallback)', (done) => {
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

    interceptor.intercept(buildContext(req), next).subscribe({
      complete: () => {
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ usuarioId: 99 }),
          }),
        );
        done();
      },
    });
  });
});
