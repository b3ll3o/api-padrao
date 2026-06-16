import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  HttpHealthIndicator,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { Reflector } from '@nestjs/core';
import { HealthController } from './health.controller';
import { PrismaService } from '../../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../../../auth/application/decorators/public.decorator';

// TDD: AGENTS.md §7 — health endpoints são públicos (k8s probes sem JWT)

describe('HealthController', () => {
  let controller: HealthController;
  let reflector: Reflector;

  const mockHealth = { check: jest.fn() };
  const mockHttp = { pingCheck: jest.fn() };
  const mockPrismaIndicator = { pingCheck: jest.fn() };
  const mockMemory = { checkHeap: jest.fn() };
  const mockDisk = { checkStorage: jest.fn() };
  const mockPrisma = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealth },
        { provide: HttpHealthIndicator, useValue: mockHttp },
        { provide: PrismaHealthIndicator, useValue: mockPrismaIndicator },
        { provide: MemoryHealthIndicator, useValue: mockMemory },
        { provide: DiskHealthIndicator, useValue: mockDisk },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get(HealthController);
    reflector = module.get(Reflector);
    jest.clearAllMocks();

    // Mock padrão: health.check executa os checks recebidos e retorna o resultado
    mockHealth.check.mockImplementation(async (checks: any[]) => {
      const results: any = {};
      for (const c of checks) {
        const r = await c();
        Object.assign(results, r);
      }
      return { status: 'ok', info: results, error: {}, details: results };
    });
    mockMemory.checkHeap.mockReturnValue(() =>
      Promise.resolve({ memory_heap: { status: 'up' } }),
    );
    mockPrismaIndicator.pingCheck.mockReturnValue(() =>
      Promise.resolve({ database: { status: 'up' } }),
    );
    mockDisk.checkStorage.mockReturnValue(() =>
      Promise.resolve({ storage: { status: 'up' } }),
    );
    mockHttp.pingCheck.mockReturnValue(() =>
      Promise.resolve({ google: { status: 'up' } }),
    );
  });

  it('deve ser definido', () => {
    expect(controller).toBeInstanceOf(HealthController);
  });

  describe('checkLiveness', () => {
    it('deve chamar health.check com check de heap de memória (limite 150MB)', async () => {
      const result = await controller.checkLiveness();

      expect(mockMemory.checkHeap).toHaveBeenCalledWith(
        'memory_heap',
        150 * 1024 * 1024,
      );
      expect(result.status).toBe('ok');
    });

    it('deve ser @Public() (k8s liveness probe sem JWT)', () => {
      expect(
        reflector.get(IS_PUBLIC_KEY, HealthController.prototype.checkLiveness),
      ).toBe(true);
    });
  });

  describe('checkReadiness', () => {
    it('deve chamar health.check com pingCheck do Prisma + disco', async () => {
      await controller.checkReadiness();

      expect(mockPrismaIndicator.pingCheck).toHaveBeenCalledWith(
        'database',
        mockPrisma,
      );
      expect(mockDisk.checkStorage).toHaveBeenCalledWith(
        'storage',
        expect.objectContaining({ path: '/', thresholdPercent: 0.9 }),
      );
    });

    it('deve ser @Public() (k8s readiness probe sem JWT)', () => {
      expect(
        reflector.get(IS_PUBLIC_KEY, HealthController.prototype.checkReadiness),
      ).toBe(true);
    });
  });

  describe('checkNetwork', () => {
    it('deve chamar health.check com pingCheck HTTP para google.com', async () => {
      await controller.checkNetwork();

      expect(mockHttp.pingCheck).toHaveBeenCalledWith(
        'google',
        'https://google.com',
      );
    });

    it('deve ser @Public()', () => {
      expect(
        reflector.get(IS_PUBLIC_KEY, HealthController.prototype.checkNetwork),
      ).toBe(true);
    });
  });
});
