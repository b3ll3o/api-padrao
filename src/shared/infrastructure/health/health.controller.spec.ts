import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  PrismaHealthIndicator,
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
  const mockPrismaIndicator = { pingCheck: jest.fn() };
  const mockDisk = { checkStorage: jest.fn() };
  const mockPrisma = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealth },
        { provide: PrismaHealthIndicator, useValue: mockPrismaIndicator },
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
    mockPrismaIndicator.pingCheck.mockReturnValue(() =>
      Promise.resolve({ database: { status: 'up' } }),
    );
    mockDisk.checkStorage.mockReturnValue(() =>
      Promise.resolve({ storage: { status: 'up' } }),
    );
  });

  it('deve ser definido', () => {
    expect(controller).toBeInstanceOf(HealthController);
  });

  describe('checkLiveness', () => {
    // [HEALTH-001] Liveness não checa mais memória — k8s iria matar
    // pods saudáveis (150MB é baixo para NestJS+Prisma em prod).
    it('deve chamar health.check com lista vazia (apenas sinaliza processo ativo)', async () => {
      const result = await controller.checkLiveness();

      expect(mockHealth.check).toHaveBeenCalledWith([]);
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
});
