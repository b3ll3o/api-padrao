import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';

// TDD: AGENTS.md §4 — Idempotency-Key é mecanismo de resiliência B2B
// (Stripe-style). Se parar de cachear, retries de rede causam duplicação.

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let mockCache: { get: jest.Mock; set: jest.Mock };

  const buildContext = (req: any, res: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
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
    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();
    interceptor = module.get(IdempotencyInterceptor);
  });

  it('no-op quando header Idempotency-Key ausente', (done) => {
    const req = { headers: {} };
    const res = { setHeader: jest.fn(), statusCode: 200, status: jest.fn() };
    const next: CallHandler = {
      handle: () => {
        expect(mockCache.get).not.toHaveBeenCalled();
        return of({ id: 1 });
      },
    };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: (data) => {
        expect(data).toEqual({ id: 1 });
        done();
      },
    });
  });

  it('no-op quando header Idempotency-Key tem formato inválido (curto)', (done) => {
    const req = { headers: { 'idempotency-key': 'short' } };
    const res = { setHeader: jest.fn(), statusCode: 200, status: jest.fn() };
    const next: CallHandler = {
      handle: () => {
        expect(mockCache.get).not.toHaveBeenCalled();
        return of({ id: 1 });
      },
    };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: () => done(),
    });
  });

  it('replay: retorna response cacheada e seta header Idempotency-Replayed', (done) => {
    const cachedResponse = { status: 201, body: { id: 42 } };
    mockCache.get.mockResolvedValue(cachedResponse);

    const req = { headers: { 'idempotency-key': 'idem-12345678' } };
    const res = {
      setHeader: jest.fn(),
      statusCode: 0,
      status: jest.fn().mockReturnThis(),
    };
    const next: CallHandler = { handle: () => of(null) };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: (data) => {
        expect(data).toEqual({ id: 42 });
        expect(res.setHeader).toHaveBeenCalledWith(
          'Idempotency-Replayed',
          'true',
        );
        expect(res.status).toHaveBeenCalledWith(201);
        done();
      },
    });
  });

  it('cacheia response 2xx', (done) => {
    mockCache.get.mockResolvedValue(null);
    const req = { headers: { 'idempotency-key': 'idem-12345678' } };
    const res = {
      setHeader: jest.fn(),
      statusCode: 201,
      status: jest.fn().mockReturnThis(),
    };
    const next: CallHandler = { handle: () => of({ id: 99 }) };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: () => {
        // set é assíncrono via cache-manager; aguarda próximo tick
        setImmediate(() => {
          expect(mockCache.set).toHaveBeenCalledWith(
            'idempotency:idem-12345678',
            { status: 201, body: { id: 99 } },
            24 * 60 * 60 * 1000,
          );
          done();
        });
      },
    });
  });

  it('NÃO cacheia response 4xx (cliente pode retentar)', (done) => {
    mockCache.get.mockResolvedValue(null);
    const req = { headers: { 'idempotency-key': 'idem-12345678' } };
    const res = {
      setHeader: jest.fn(),
      statusCode: 422,
      status: jest.fn().mockReturnThis(),
    };
    const next: CallHandler = {
      handle: () => of({ message: 'validation error' }),
    };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: () => {
        setImmediate(() => {
          expect(mockCache.set).not.toHaveBeenCalled();
          done();
        });
      },
    });
  });
});
