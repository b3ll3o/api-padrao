import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { AppConfig } from '../config/app.config';
import { IDEMPOTENT_KEY } from './idempotent.decorator';

// TDD: AGENTS.md §4 — Idempotency-Key é mecanismo de resiliência B2B
// (Stripe-style). Se parar de cachear, retries de rede causam duplicação.
// REQ-CC-IDEMPOTENT-001.2b: atomicidade via Redis SETNX (lock distribuído).
// REQ-CC-IDEMPOTENT-001.3/1.5/1.6: TTL configurável, audit log, @Idempotent opt-in.

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let mockCache: { get: jest.Mock; set: jest.Mock };
  let mockRedis: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };
  let mockCacheWithStore: any;
  let mockAppConfig: {
    idempotencyTtlSeconds: number;
    idempotencyLockTtlSeconds: number;
  };
  let mockReflector: { getAllAndOverride: jest.Mock };

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

  // Helper: simula que o endpoint atual tem @Idempotent() aplicado.
  const enableIdempotentDecorator = (
    opts: { ttlSeconds?: number } = { ttlSeconds: undefined },
  ) => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(opts);
  };

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
    mockAppConfig = {
      idempotencyTtlSeconds: 24 * 60 * 60, // 86400 (24h default)
      idempotencyLockTtlSeconds: 60,
    };
    // Por default, simula que o handler NÃO tem @Idempotent() — comportamento
    // no-op. Cada teste opt-in chama `enableIdempotentDecorator()`.
    mockReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        { provide: CACHE_MANAGER, useValue: mockCacheWithStore },
        { provide: AppConfig, useValue: mockAppConfig },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();
    interceptor = module.get(IdempotencyInterceptor);
  });

  // ---- REQ-CC-IDEMPOTENT-001.6 — opt-in via @Idempotent() ----

  it('no-op quando endpoint não tem @Idempotent() decorator', (done) => {
    // mockReflector retorna undefined por default
    const req = { headers: { 'idempotency-key': 'idem-12345678' } };
    const res = { setHeader: jest.fn(), statusCode: 200, status: jest.fn() };
    const next: CallHandler = {
      handle: () => {
        // Sem @Idempotent(): cache.get nunca é chamado
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

  it('ativa idempotency quando endpoint tem @Idempotent() (Reflector retorna metadata)', (done) => {
    enableIdempotentDecorator();
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
        setImmediate(() => {
          expect(mockCache.get).toHaveBeenCalled();
          done();
        });
      },
    });
  });

  it('no-op quando header Idempotency-Key ausente', (done) => {
    enableIdempotentDecorator();
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
    enableIdempotentDecorator();
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

  // ---- REQ-CC-IDEMPOTENT-001.5 — Audit log estruturado no replay ----

  it('replay: seta Idempotency-Original-Timestamp + headers de replay', (done) => {
    enableIdempotentDecorator();
    const originalTs = new Date('2026-06-22T10:00:00.000Z');
    const cachedResponse = {
      status: 201,
      body: { id: 42 },
      timestamp: originalTs,
      userId: 7,
    };
    mockCache.get.mockResolvedValue(cachedResponse);

    const req = {
      headers: { 'idempotency-key': 'idem-12345678' },
      user: { sub: 7 },
    };
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
        expect(res.setHeader).toHaveBeenCalledWith(
          'Idempotency-Original-Timestamp',
          '2026-06-22T10:00:00.000Z',
        );
        expect(res.status).toHaveBeenCalledWith(201);
        // Replay NÃO deve adquirir lock (já temos a response cacheada).
        expect(mockRedis.set).not.toHaveBeenCalled();
        done();
      },
    });
  });

  // ---- REQ-CC-IDEMPOTENT-001.3 — TTL configurável ----

  it('usa TTL do AppConfig (86400s default) ao cachear response', (done) => {
    enableIdempotentDecorator();
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
        setImmediate(() => {
          expect(mockCache.set).toHaveBeenCalledWith(
            'idempotency:idem-12345678',
            expect.objectContaining({
              status: 201,
              body: { id: 99 },
              timestamp: expect.any(Date),
            }),
            24 * 60 * 60 * 1000, // 86400s * 1000
          );
          done();
        });
      },
    });
  });

  it('usa TTL custom do AppConfig quando IDEMPOTENCY_TTL_SECONDS=60', (done) => {
    // Override do mock: 60s = 60_000ms
    mockAppConfig.idempotencyTtlSeconds = 60;
    enableIdempotentDecorator();
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
        setImmediate(() => {
          expect(mockCache.set).toHaveBeenCalledWith(
            'idempotency:idem-12345678',
            expect.objectContaining({ status: 201 }),
            60_000,
          );
          done();
        });
      },
    });
  });

  it('override de TTL por endpoint via @Idempotent({ttlSeconds}) tem precedência', (done) => {
    enableIdempotentDecorator({ ttlSeconds: 3600 });
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
        setImmediate(() => {
          expect(mockCache.set).toHaveBeenCalledWith(
            'idempotency:idem-12345678',
            expect.objectContaining({ status: 201 }),
            3_600_000, // 3600s
          );
          done();
        });
      },
    });
  });

  it('usa lock TTL do AppConfig (60s default)', (done) => {
    enableIdempotentDecorator();
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
        expect(mockRedis.set).toHaveBeenCalledWith(
          'idem:lock:idem-12345678',
          'processing',
          { NX: true, EX: 60 },
        );
        done();
      },
    });
  });

  it('cacheia response 2xx', (done) => {
    enableIdempotentDecorator();
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
        setImmediate(() => {
          expect(mockCache.set).toHaveBeenCalledWith(
            'idempotency:idem-12345678',
            expect.objectContaining({ status: 201, body: { id: 99 } }),
            expect.any(Number),
          );
          done();
        });
      },
    });
  });

  it('NÃO cacheia response 4xx (cliente pode retentar)', (done) => {
    enableIdempotentDecorator();
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
    enableIdempotentDecorator();
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
    enableIdempotentDecorator();
    mockCache.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue(null);

    const req = { headers: { 'idempotency-key': 'idem-12345678' } };
    const res = {
      setHeader: jest.fn(),
      statusCode: 200,
      status: jest.fn().mockReturnThis(),
    };
    const next: CallHandler = {
      handle: () => of({ id: 1 }),
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
    enableIdempotentDecorator();
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
    enableIdempotentDecorator();
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
        expect(mockRedis.del).toHaveBeenCalledWith('idem:lock:idem-12345678');
        done();
      },
    });
  });

  it('degrada graciosamente se Redis offline (fail-open sem lock)', (done) => {
    enableIdempotentDecorator();
    mockCache.get.mockResolvedValue(null);
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
    enableIdempotentDecorator();
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

  it('inclui userId do JWT no cache para audit', (done) => {
    enableIdempotentDecorator();
    mockCache.get.mockResolvedValue(null);
    const req = {
      headers: { 'idempotency-key': 'idem-12345678' },
      user: { sub: 99 },
    };
    const res = {
      setHeader: jest.fn(),
      statusCode: 201,
      status: jest.fn().mockReturnThis(),
    };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: () => {
        setImmediate(() => {
          expect(mockCache.set).toHaveBeenCalledWith(
            'idempotency:idem-12345678',
            expect.objectContaining({ userId: 99 }),
            expect.any(Number),
          );
          done();
        });
      },
    });
  });

  it('Reflector é consultado com IDEMPOTENT_KEY canônico', (done) => {
    enableIdempotentDecorator();
    const req = { headers: {} };
    const res = { setHeader: jest.fn(), statusCode: 200, status: jest.fn() };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(buildContext(req, res), next).subscribe({
      next: () => {
        expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
          IDEMPOTENT_KEY,
          expect.any(Array),
        );
        done();
      },
    });
  });
});
