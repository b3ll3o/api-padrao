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
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
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
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
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
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
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
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
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
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
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
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
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
});
