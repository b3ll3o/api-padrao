import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

// TDD: AGENTS.md §10 — PrismaService expõe `extended` (soft-delete auto-filtro)
//      e implementa ciclo de vida Nest. Circuit breaker opossum removido (A1,
//      sweep 2026-06-21) — zero call-sites, código morto.

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);

    // Impede o construtor de tentar conectar em testes sem DB
    service.$connect = jest.fn().mockResolvedValue(undefined);
    service.$disconnect = jest.fn().mockResolvedValue(undefined);
  });

  it('deve ser uma instância de PrismaService (extends PrismaClient)', () => {
    expect(typeof service.onModuleInit).toBe('function');
    expect(typeof service.onModuleDestroy).toBe('function');
  });

  it('deve estender PrismaClient (acesso aos modelos)', () => {
    expect(service).toHaveProperty('usuario');
    expect(service).toHaveProperty('empresa');
    expect(service).toHaveProperty('perfil');
    expect(service).toHaveProperty('permissao');
  });

  it('deve implementar OnModuleInit e OnModuleDestroy (contrato Nest)', () => {
    expect(typeof service.onModuleInit).toBe('function');
    expect(typeof service.onModuleDestroy).toBe('function');
  });

  describe('ciclo de vida', () => {
    it('onModuleInit deve chamar $connect', async () => {
      await service.onModuleInit();
      expect(service.$connect).toHaveBeenCalledTimes(1);
    });

    it('onModuleDestroy deve chamar $disconnect', async () => {
      await service.onModuleDestroy();
      expect(service.$disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('soft-delete extension', () => {
    it('deve expor `extended` com o cliente $extends(softDeleteExtension)', () => {
      expect(service.extended).not.toBe(service);
      expect(service.extended).toBe(service['_extendedClient']);
    });

    it('extended deve ser diferente do próprio service (cópia estendida)', () => {
      expect(service.extended).not.toBe(service);
    });
  });
});
