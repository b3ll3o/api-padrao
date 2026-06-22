import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmpresaInterceptor } from './empresa.interceptor';
import { EmpresaContext } from '../services/empresa-context.service';
import { AuthorizationService } from '../../domain/services/authorization.service';
import { of } from 'rxjs';

describe('EmpresaInterceptor', () => {
  let interceptor: EmpresaInterceptor;
  let context: EmpresaContext;
  let mockAuthorization: { isAdmin: jest.Mock };

  beforeEach(() => {
    context = new EmpresaContext();
    mockAuthorization = { isAdmin: jest.fn().mockReturnValue(false) };
    interceptor = new EmpresaInterceptor(
      context,
      {} as Reflector,
      mockAuthorization as unknown as AuthorizationService,
    );
  });

  it('deve ser definido', () => {
    expect(interceptor).toBeInstanceOf(EmpresaInterceptor);
  });

  it('deve extrair empresaId do header x-empresa-id', (done) => {
    const request = {
      headers: { 'x-empresa-id': 'header-uuid' },
      user: { sub: 1, empresaId: 'header-uuid' },
    };
    const response = { setHeader: jest.fn(), headersSent: false };
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => {
        expect(context.empresaId).toBe('header-uuid');
        expect(context.usuarioId).toBe(1);
        return of(null);
      },
    };

    interceptor.intercept(executionContext, next).subscribe({
      complete: () => done(),
    });
  });

  it('deve extrair empresaId do JWT se o header estiver ausente', (done) => {
    const request = {
      headers: {},
      user: { sub: 1, empresaId: 'jwt-uuid' },
    };
    const response = { setHeader: jest.fn(), headersSent: false };
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => {
        expect(context.empresaId).toBe('jwt-uuid');
        return of(null);
      },
    };

    interceptor.intercept(executionContext, next).subscribe({
      complete: () => done(),
    });
  });

  it('deve priorizar o header x-empresa-id sobre o JWT quando ambos são iguais', (done) => {
    const request = {
      headers: { 'x-empresa-id': 'tenant-a' },
      user: { sub: 1, empresaId: 'tenant-a' },
    };
    const response = { setHeader: jest.fn(), headersSent: false };
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => {
        expect(context.empresaId).toBe('tenant-a');
        return of(null);
      },
    };

    interceptor.intercept(executionContext, next).subscribe({
      complete: () => done(),
    });
  });

  it('[SEC-005] deve lançar 403 quando header x-empresa-id diverge do JWT (IDOR)', (done) => {
    const request = {
      headers: { 'x-empresa-id': 'tenant-b' },
      user: { sub: 1, empresaId: 'tenant-a' },
    };
    const response = { setHeader: jest.fn(), headersSent: false };
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => of(null),
    };

    interceptor.intercept(executionContext, next).subscribe({
      error: (err) => {
        expect(err.message).toContain('x-empresa-id não corresponde');
        // EmpresaContext não foi populado (empresaId getter lança
        // se não há store — esse throw é exatamente o que queremos).
        expect(() => context.empresaId).toThrow();
        done();
      },
    });
  });

  it('[SEC-005] admin global pode alternar entre tenants via header', (done) => {
    mockAuthorization.isAdmin.mockReturnValue(true);
    const request = {
      headers: { 'x-empresa-id': 'tenant-b' },
      user: { sub: 1, empresaId: 'tenant-a' },
    };
    const response = { setHeader: jest.fn(), headersSent: false };
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => {
        expect(context.empresaId).toBe('tenant-b');
        return of(null);
      },
    };

    interceptor.intercept(executionContext, next).subscribe({
      complete: () => done(),
    });
  });

  it('não deve setar contexto se o usuário não estiver logado', (done) => {
    const request = {
      headers: { 'x-empresa-id': 'header-uuid' },
    };
    const response = { setHeader: jest.fn(), headersSent: false };
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => {
        expect(() => context.empresaId).toThrow();
        return of(null);
      },
    };

    interceptor.intercept(executionContext, next).subscribe({
      complete: () => done(),
    });
  });

  // ---- QuickWin 4a: x-request-id response header ----

  it('[QuickWin 4a] propaga x-request-id do header para o response', (done) => {
    const request = {
      headers: { 'x-request-id': 'incoming-req-123', 'x-empresa-id': 't1' },
      user: { sub: 1, empresaId: 't1' },
    };
    const response = { setHeader: jest.fn(), headersSent: false };
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of(null) };

    interceptor.intercept(executionContext, next).subscribe({
      complete: () => {
        expect(response.setHeader).toHaveBeenCalledWith(
          'x-request-id',
          'incoming-req-123',
        );
        done();
      },
    });
  });

  it('[QuickWin 4a] gera UUID v4 quando x-request-id ausente', (done) => {
    const request = {
      headers: {},
      user: undefined,
    };
    const response = { setHeader: jest.fn(), headersSent: false };
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of(null) };

    interceptor.intercept(executionContext, next).subscribe({
      complete: () => {
        expect(response.setHeader).toHaveBeenCalledWith(
          'x-request-id',
          expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          ),
        );
        done();
      },
    });
  });
});
