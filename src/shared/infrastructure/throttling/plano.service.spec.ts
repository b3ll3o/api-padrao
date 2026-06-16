// BDD: features/usuarios.feature:Cenário: Rate limit por tenant — FREE bloqueia em 100 req/min
// TDD: src/shared/infrastructure/throttling/plano.service.spec.ts
// SDD: .openspec/changes/tenant-rate-limit/design.md:REQ-TR-004, NFR-TR-002, NFR-TR-003
import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Plano } from '@prisma/client';
import { PlanoService } from './plano.service';
import { CACHE_KEY_PREFIX, CACHE_TTL_MS } from './plano-limits.config';
import { PrismaService } from 'src/prisma/prisma.service';

describe('PlanoService', () => {
  let service: PlanoService;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let prisma: { empresa: { findUnique: jest.Mock } };

  beforeEach(async () => {
    cache = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      empresa: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanoService,
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PlanoService>(PlanoService);
  });

  describe('getPlanoByEmpresaId', () => {
    it('deve retornar plano do cache em caso de cache hit (sem consultar Prisma)', async () => {
      cache.get.mockResolvedValue(Plano.PRO);
      const plano = await service.getPlanoByEmpresaId('empresa-1');
      expect(plano).toBe(Plano.PRO);
      expect(prisma.empresa.findUnique).not.toHaveBeenCalled();
    });

    it('deve consultar Prisma em caso de cache miss e popular cache com TTL 60s', async () => {
      cache.get.mockResolvedValue(undefined);
      prisma.empresa.findUnique.mockResolvedValue({
        plano: Plano.ENTERPRISE,
        ativo: true,
        deletedAt: null,
      });
      const plano = await service.getPlanoByEmpresaId('empresa-2');
      expect(plano).toBe(Plano.ENTERPRISE);
      expect(prisma.empresa.findUnique).toHaveBeenCalledWith({
        where: { id: 'empresa-2' },
        select: { plano: true, ativo: true, deletedAt: true },
      });
      expect(cache.set).toHaveBeenCalledWith(
        `${CACHE_KEY_PREFIX}empresa-2`,
        Plano.ENTERPRISE,
        CACHE_TTL_MS,
      );
    });

    it('deve retornar FREE quando empresa não existe (not_found)', async () => {
      cache.get.mockResolvedValue(undefined);
      prisma.empresa.findUnique.mockResolvedValue(null);
      const plano = await service.getPlanoByEmpresaId('empresa-inexistente');
      expect(plano).toBe(Plano.FREE);
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('deve retornar FREE quando empresa está inativa (ativo=false)', async () => {
      cache.get.mockResolvedValue(undefined);
      prisma.empresa.findUnique.mockResolvedValue({
        plano: Plano.PRO,
        ativo: false,
        deletedAt: null,
      });
      const plano = await service.getPlanoByEmpresaId('empresa-inativa');
      expect(plano).toBe(Plano.FREE);
    });

    it('deve retornar FREE quando empresa está soft-deletada (deletedAt != null)', async () => {
      cache.get.mockResolvedValue(undefined);
      prisma.empresa.findUnique.mockResolvedValue({
        plano: Plano.PRO,
        ativo: true,
        deletedAt: new Date(),
      });
      const plano = await service.getPlanoByEmpresaId('empresa-deletada');
      expect(plano).toBe(Plano.FREE);
    });

    it('deve retornar FREE quando Redis lança (degradação graciosa — NFR-TR-002)', async () => {
      cache.get.mockRejectedValue(new Error('Redis connection refused'));
      prisma.empresa.findUnique.mockResolvedValue({
        plano: Plano.PRO,
        ativo: true,
        deletedAt: null,
      });
      const plano = await service.getPlanoByEmpresaId('empresa-3');
      expect(plano).toBe(Plano.PRO);
      // A chamada ao Prisma aconteceu porque Redis falhou
      expect(prisma.empresa.findUnique).toHaveBeenCalled();
    });

    it('deve retornar FREE quando cache hit tem valor inválido (defesa em profundidade)', async () => {
      cache.get.mockResolvedValue('PLANO_INEXISTENTE');
      prisma.empresa.findUnique.mockResolvedValue({
        plano: Plano.FREE,
        ativo: true,
        deletedAt: null,
      });
      const plano = await service.getPlanoByEmpresaId('empresa-4');
      expect(plano).toBe(Plano.FREE);
    });
  });

  describe('invalidate', () => {
    it('deve deletar a chave de cache do tenant', async () => {
      await service.invalidate('empresa-5');
      expect(cache.del).toHaveBeenCalledWith(`${CACHE_KEY_PREFIX}empresa-5`);
    });

    it('não deve lançar quando cache falha', async () => {
      cache.del.mockRejectedValue(new Error('Redis offline'));
      await expect(service.invalidate('empresa-6')).resolves.toBeUndefined();
    });
  });
});
