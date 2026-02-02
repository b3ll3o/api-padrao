import { ExecutionContext, CallHandler } from '@nestjs/common';
import { EmpresaInterceptor } from './empresa.interceptor';
import { EmpresaContext } from '../services/empresa-context.service';
import { of } from 'rxjs';

describe('EmpresaInterceptor', () => {
  let interceptor: EmpresaInterceptor;
  let context: EmpresaContext;

  beforeEach(() => {
    context = new EmpresaContext();
    interceptor = new EmpresaInterceptor(context);
  });

  it('deve ser definido', () => {
    expect(interceptor).toBeDefined();
  });

  it('deve extrair empresaId do header x-empresa-id', () => {
    const request = {
      headers: { 'x-empresa-id': 'header-uuid' },
      user: { sub: 1 },
    };
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => of(null),
    };

    interceptor.intercept(executionContext, next);

    expect(context.empresaId).toBe('header-uuid');
    expect(context.usuarioId).toBe(1);
  });

  it('deve extrair empresaId do usuário logado se o header estiver ausente', () => {
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
      handle: () => of(null),
    };

    interceptor.intercept(executionContext, next);

    expect(context.empresaId).toBe('jwt-uuid');
  });

  it('deve priorizar o header x-empresa-id sobre o JWT', () => {
    const request = {
      headers: { 'x-empresa-id': 'header-uuid' },
      user: { sub: 1, empresaId: 'jwt-uuid' },
    };
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => of(null),
    };

    interceptor.intercept(executionContext, next);

    expect(context.empresaId).toBe('header-uuid');
  });

  it('não deve setar contexto se o usuário não estiver logado', () => {
    const request = {
      headers: { 'x-empresa-id': 'header-uuid' },
    };
    const executionContext = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => of(null),
    };

    interceptor.intercept(executionContext, next);

    expect(() => context.empresaId).toThrow();
  });
});
