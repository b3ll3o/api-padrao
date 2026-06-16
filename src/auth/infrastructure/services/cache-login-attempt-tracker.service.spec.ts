// BDD: features/autenticacao.feature:Cenário: Bloquear após N tentativas
// SDD: .openspec/changes/auth/design.md
// TDD: cobertura do adapter Redis (fail-open) para LoginAttemptTracker.
import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CacheLoginAttemptTracker } from './cache-login-attempt-tracker.service';

describe('CacheLoginAttemptTracker', () => {
  let service: CacheLoginAttemptTracker;
  let cache: jest.Mocked<Pick<Cache, 'get' | 'set' | 'del'>>;

  beforeEach(async () => {
    cache = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    } as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheLoginAttemptTracker,
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();
    service = module.get<CacheLoginAttemptTracker>(CacheLoginAttemptTracker);
  });

  describe('isLocked', () => {
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

    it('degrada aberto (fail-open) quando o cache.get falha', async () => {
      cache.get.mockRejectedValue(new Error('Redis offline'));
      await expect(service.isLocked('user@e.com')).resolves.toBe(false);
    });

    it('normaliza o email para minúsculo ao construir a chave', async () => {
      cache.get.mockResolvedValue(null);
      await service.isLocked('USER@E.COM');
      expect(cache.get).toHaveBeenCalledWith('auth:login:attempts:user@e.com');
    });
  });

  describe('recordFailure', () => {
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

    it('NÃO lança quando o cache falha (fail-open)', async () => {
      cache.get.mockRejectedValue(new Error('Redis offline'));
      await expect(
        service.recordFailure('user@e.com'),
      ).resolves.toBeUndefined();
    });
  });

  describe('clearFailures', () => {
    it('deleta a chave do email normalizado', async () => {
      await service.clearFailures('USER@E.COM');
      expect(cache.del).toHaveBeenCalledWith('auth:login:attempts:user@e.com');
    });

    it('NÃO lança quando o cache falha (fail-open)', async () => {
      cache.del.mockRejectedValue(new Error('Redis offline'));
      await expect(
        service.clearFailures('user@e.com'),
      ).resolves.toBeUndefined();
    });
  });
});
