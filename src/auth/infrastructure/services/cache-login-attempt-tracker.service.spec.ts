// BDD: features/autenticacao.feature:Cenário: Bloquear após N tentativas
// SDD: .openspec/changes/auth/design.md
// TDD: cobertura do adapter Redis (com fallback Prisma) para LoginAttemptTracker.
//
// [H3] Quando o Redis está offline, o adapter agora cai para a tabela
// `login_attempts` via PrismaService — antes era fail-open (HIGH finding
// do DevSecOps sweep 2026-06-21). Os testes abaixo cobrem:
// - Caminho Redis OK (caminho primário).
// - Redis offline → fallback Prisma (caminho de degradação).
// - Redis + Prisma offline → fail-CLOSED para `isLocked` (defesa em
//   profundidade — prefere indisponibilidade temporária a abrir lockout).
// - Janela de tempo: tentativas fora dos 15 min não contam.
import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CacheLoginAttemptTracker } from './cache-login-attempt-tracker.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('CacheLoginAttemptTracker', () => {
  let service: CacheLoginAttemptTracker;
  let cache: jest.Mocked<Pick<Cache, 'get' | 'set' | 'del'>>;
  let prisma: { loginAttempt: { count: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    cache = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    } as any;
    prisma = {
      loginAttempt: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheLoginAttemptTracker,
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<CacheLoginAttemptTracker>(CacheLoginAttemptTracker);
  });

  describe('isLocked — caminho Redis (primário)', () => {
    it('retorna false quando não há contagem registrada', async () => {
      cache.get.mockResolvedValue(null);
      await expect(service.isLocked('user@e.com')).resolves.toBe(false);
    });

    it('retorna false quando a contagem é menor que o limite', async () => {
      cache.get.mockResolvedValue(2);
      await expect(service.isLocked('user@e.com')).resolves.toBe(false);
    });

    it('retorna true quando a contagem atinge o limite (5)', async () => {
      cache.get.mockResolvedValue(5);
      await expect(service.isLocked('user@e.com')).resolves.toBe(true);
    });

    it('retorna true quando a contagem ultrapassa o limite', async () => {
      cache.get.mockResolvedValue(7);
      await expect(service.isLocked('user@e.com')).resolves.toBe(true);
    });

    it('retorna false quando o valor no cache é de tipo não-numérico', async () => {
      cache.get.mockResolvedValue('cinco' as any);
      await expect(service.isLocked('user@e.com')).resolves.toBe(false);
    });

    it('normaliza o email para minúsculo ao construir a chave', async () => {
      cache.get.mockResolvedValue(null);
      await service.isLocked('USER@E.COM');
      expect(cache.get).toHaveBeenCalledWith('auth:login:attempts:user@e.com');
    });

    it('NÃO consulta Prisma quando Redis responde (mesmo null)', async () => {
      cache.get.mockResolvedValue(null);
      await service.isLocked('user@e.com');
      expect(prisma.loginAttempt.count).not.toHaveBeenCalled();
    });
  });

  describe('isLocked — fallback Prisma (Redis offline)', () => {
    it('conta falhas via Prisma quando Redis lança erro', async () => {
      cache.get.mockRejectedValue(new Error('Redis offline'));
      prisma.loginAttempt.count.mockResolvedValue(3);
      await expect(service.isLocked('user@e.com')).resolves.toBe(false);
      expect(prisma.loginAttempt.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: 'user@e.com',
            success: false,
          }),
        }),
      );
    });

    it('retorna true via Prisma quando falhas >= MAX_ATTEMPTS', async () => {
      cache.get.mockRejectedValue(new Error('Redis offline'));
      prisma.loginAttempt.count.mockResolvedValue(5);
      await expect(service.isLocked('user@e.com')).resolves.toBe(true);
    });

    it('normaliza email ao consultar Prisma no fallback', async () => {
      cache.get.mockRejectedValue(new Error('Redis offline'));
      prisma.loginAttempt.count.mockResolvedValue(0);
      await service.isLocked('USER@E.COM');
      expect(prisma.loginAttempt.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: 'user@e.com' }),
        }),
      );
    });

    it('passa janela de 15 minutos (attemptedAt gte) na query de fallback', async () => {
      cache.get.mockRejectedValue(new Error('Redis offline'));
      prisma.loginAttempt.count.mockResolvedValue(0);
      const before = Date.now();
      await service.isLocked('user@e.com');
      const after = Date.now();

      const call = prisma.loginAttempt.count.mock.calls[0][0];
      const where = call.where;
      const windowStart = where.attemptedAt.gte as Date;
      const fifteenMinAgo = new Date(after - 15 * 60 * 1000);

      // Janela deve estar entre `before - 15min` e `after - 15min`.
      expect(windowStart.getTime()).toBeGreaterThanOrEqual(
        before - 15 * 60 * 1000,
      );
      expect(windowStart.getTime()).toBeLessThanOrEqual(
        fifteenMinAgo.getTime(),
      );
    });
  });

  describe('isLocked — fail-CLOSED (Redis + Prisma offline)', () => {
    it('retorna true quando ambos armazenamentos falham (defesa em profundidade)', async () => {
      cache.get.mockRejectedValue(new Error('Redis offline'));
      prisma.loginAttempt.count.mockRejectedValue(new Error('DB offline'));
      await expect(service.isLocked('user@e.com')).resolves.toBe(true);
    });
  });

  describe('recordFailure — caminho Redis (primário)', () => {
    it('incrementa o contador a partir de 0 quando não há valor prévio', async () => {
      cache.get.mockResolvedValue(null);
      await service.recordFailure('user@e.com');
      expect(cache.set).toHaveBeenCalledWith(
        'auth:login:attempts:user@e.com',
        1,
        15 * 60 * 1000,
      );
    });

    it('incrementa o contador somando ao valor prévio', async () => {
      cache.get.mockResolvedValue(3);
      await service.recordFailure('user@e.com');
      expect(cache.set).toHaveBeenCalledWith(
        'auth:login:attempts:user@e.com',
        4,
        15 * 60 * 1000,
      );
    });

    it('aplica TTL de 15 minutos (lockout window)', async () => {
      cache.get.mockResolvedValue(0);
      await service.recordFailure('user@e.com');
      const setArgs = cache.set.mock.calls[0];
      expect(setArgs[2]).toBe(900_000);
    });

    it('normaliza o email ao incrementar', async () => {
      cache.get.mockResolvedValue(null);
      await service.recordFailure('USER@E.COM');
      expect(cache.get).toHaveBeenCalledWith('auth:login:attempts:user@e.com');
      expect(cache.set).toHaveBeenCalledWith(
        'auth:login:attempts:user@e.com',
        1,
        expect.any(Number),
      );
    });

    it('NÃO consulta Prisma quando Redis set sucede', async () => {
      cache.get.mockResolvedValue(null);
      await service.recordFailure('user@e.com');
      expect(prisma.loginAttempt.create).not.toHaveBeenCalled();
    });
  });

  describe('recordFailure — fallback Prisma (Redis offline)', () => {
    it('grava linha com success=false quando Redis lança no get', async () => {
      cache.get.mockRejectedValue(new Error('Redis offline'));
      await service.recordFailure('user@e.com');
      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'user@e.com',
          success: false,
        }),
      });
    });

    it('grava linha quando Redis lança no set (mesmo get OK)', async () => {
      cache.get.mockResolvedValue(2);
      cache.set.mockRejectedValue(new Error('Redis offline'));
      await service.recordFailure('user@e.com');
      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'user@e.com',
          success: false,
        }),
      });
    });

    it('NÃO lança quando AMBOS Redis e Prisma falham (engole erro e loga)', async () => {
      cache.get.mockRejectedValue(new Error('Redis offline'));
      prisma.loginAttempt.create.mockRejectedValue(new Error('DB offline'));
      await expect(
        service.recordFailure('user@e.com'),
      ).resolves.toBeUndefined();
    });
  });

  describe('clearFailures — caminho Redis (primário)', () => {
    it('deleta a chave do email normalizado', async () => {
      await service.clearFailures('USER@E.COM');
      expect(cache.del).toHaveBeenCalledWith('auth:login:attempts:user@e.com');
    });

    it('registra evento success=true no Prisma para histórico', async () => {
      await service.clearFailures('user@e.com');
      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'user@e.com',
          success: true,
        }),
      });
    });
  });

  describe('clearFailures — fallback Prisma (Redis offline)', () => {
    it('cai para Prisma quando Redis.del lança erro', async () => {
      cache.del.mockRejectedValue(new Error('Redis offline'));
      await service.clearFailures('user@e.com');
      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'user@e.com',
          success: true,
        }),
      });
    });

    it('NÃO lança quando Redis del falha e Prisma também falha', async () => {
      cache.del.mockRejectedValue(new Error('Redis offline'));
      prisma.loginAttempt.create.mockRejectedValue(new Error('DB offline'));
      await expect(
        service.clearFailures('user@e.com'),
      ).resolves.toBeUndefined();
    });

    it('NÃO lança quando Redis OK e Prisma falha', async () => {
      prisma.loginAttempt.create.mockRejectedValue(new Error('DB offline'));
      await expect(
        service.clearFailures('user@e.com'),
      ).resolves.toBeUndefined();
    });
  });
});
