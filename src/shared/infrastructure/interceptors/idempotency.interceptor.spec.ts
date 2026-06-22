import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';

// TDD: AGENTS.md §4 — Idempotency-Key é mecanismo de resiliência B2B
// (Stripe-style). Se parar de cachear, retries de rede causam duplicação.
// REQ-CC-IDEMPOTENT-001.2b: atomicidade via Redis SETNX (lock distribuído).

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let mockCache: { get: jest.Mock; set: jest.Mock };
  let mockRedis: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };
  let mockCacheWithStore: any;

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
    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    };
    // O interceptor acessa o cliente Redis via `cache.stores[0].client`
    // (forma exposta por `cache-manager-redis-yet`). Espelhamos a shape.
    mockCacheWithStore = {
      get: mockCache.get,
      set: mockCache.set,
      stores: [{ client: mockRedis }],
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        { provide: CACHE_MANAGER, useValue: mockCacheWithStore },
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
        expect(mockRedis.set).not.toHaveBeenCalled();
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
        expect(mockRedis.set).not.toHaveBeenCalled();
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
        // Replay NÃO deve adquirir lock (já temos a response cacheada).
        expect(mockRedis.set).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('cacheia response 2xx', (done) => {
    mockCache.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
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

  // ---- REQ-CC-IDEMPOTENT-001.2b — Atomicidade via Redis SETNX ----

  it('adquire lock SETNX com NX+EX antes de processar (cache miss)', (done) => {
    mockCache.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    const req = { headers: { 'idempotency-key': 'idem-12345678' } };
    const res = {
      setHeader: jest.fn(),
      statusCode: 201,
      status: jest.fn().mockReturnThis(),
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: () => {
        // Lock deve ter sido tentado com NX+EX=60s.
        expect(mockRedis.set).toHaveBeenCalledWith(
          'idem:lock:idem-12345678',
          'processing',
          { NX: true, EX: 60 },
        );
        done();
      },
    });
  });

  it('rejeita 2ª request concorrente com BadRequestException (lock contention)', (done) => {
    mockCache.get.mockResolvedValue(null);
    // SETNX falha (lock já existe) → retorna null em vez de 'OK'.
    mockRedis.set.mockResolvedValue(null);

    const req = { headers: { 'idempotency-key': 'idem-12345678' } };
    const res = {
      setHeader: jest.fn(),
      statusCode: 200,
      status: jest.fn().mockReturnThis(),
    };
    const next: CallHandler = {
      handle: () => of({ id: 1 }), // não deve ser chamado
    };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: () => done(new Error('não deveria chegar em next')),
      error: (err) => {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse()).toMatchObject({
          statusCode: 400,
          error: 'Idempotency In Progress',
        });
        done();
      },
    });
  });

  it('libera lock após sucesso (permite futuras requests expirarem)', (done) => {
    mockCache.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    const req = { headers: { 'idempotency-key': 'idem-12345678' } };
    const res = {
      setHeader: jest.fn(),
      statusCode: 201,
      status: jest.fn().mockReturnThis(),
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: () => {
        setImmediate(() => {
          expect(mockRedis.del).toHaveBeenCalledWith('idem:lock:idem-12345678');
          done();
        });
      },
    });
  });

  it('libera lock em caso de erro (permite retry do cliente)', (done) => {
    mockCache.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    const req = { headers: { 'idempotency-key': 'idem-12345678' } };
    const res = {
      setHeader: jest.fn(),
      statusCode: 500,
      status: jest.fn().mockReturnThis(),
    };
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: () => done(new Error('não deveria chegar em next')),
      error: (err) => {
        expect(err.message).toBe('boom');
        // Lock deve ter sido liberado mesmo com erro.
        expect(mockRedis.del).toHaveBeenCalledWith('idem:lock:idem-12345678');
        done();
      },
    });
  });

  it('degrada graciosamente se Redis offline (fail-open sem lock)', (done) => {
    mockCache.get.mockResolvedValue(null);
    // Redis.set falha (Redis offline) — interceptor não pode bloquear
    // a request por indisponibilidade operacional.
    mockRedis.set.mockRejectedValue(new Error('Redis connection refused'));
    const req = { headers: { 'idempotency-key': 'idem-12345678' } };
    const res = {
      setHeader: jest.fn(),
      statusCode: 201,
      status: jest.fn().mockReturnThis(),
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: (data) => {
        expect(data).toEqual({ id: 1 });
        done();
      },
    });
  });

  it('funciona sem Redis client injetado (degrada sem lock)', (done) => {
    // Substitui store por uma versão sem `client` — simula cache sem
    // Redis subjacente (e.g. cache in-memory). O interceptor não pode
    // quebrar a aplicação neste cenário.
    mockCacheWithStore.stores = [];
    mockCache.get.mockResolvedValue(null);
    const req = { headers: { 'idempotency-key': 'idem-12345678' } };
    const res = {
      setHeader: jest.fn(),
      statusCode: 201,
      status: jest.fn().mockReturnThis(),
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: (data) => {
        expect(data).toEqual({ id: 1 });
        done();
      },
    });
  });
});
