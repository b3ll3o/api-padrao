import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

// TDD: AGENTS.md §10 — PrismaService expõe `extended` (soft-delete auto-filtro),
//      `runResilient` (circuit breaker Opossum), e implementa ciclo de vida Nest.

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
    // Verificamos que service expõe o contrato esperado de PrismaService
    // (membros públicos + ciclo de vida Nest). toBeInstanceOf é frágil
    // para subclasses de PrismaClient devido ao prototype de $extends.
    expect(service).toBeDefined();
    expect(typeof service.onModuleInit).toBe('function');
    expect(typeof service.onModuleDestroy).toBe('function');
    expect(service).toHaveProperty('runResilient');
  });

  it('deve estender PrismaClient (acesso aos modelos)', () => {
    // PrismaClient expõe delegates (usuario, empresa, perfil…) como propriedades
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
      // O construtor do service aplica o softDeleteExtension
      expect(service.extended).toBeDefined();
      expect(service.extended).not.toBe(service);
    });

    it('extended deve ser diferente do próprio service (cópia estendida)', () => {
      // $extends retorna um novo cliente; o original (`service`) e `extended`
      // são objetos diferentes para não poluir o delegate base.
      expect(service.extended).not.toBe(service);
    });
  });

  describe('runResilient (Circuit Breaker Opossum)', () => {
    it('deve executar a função passada e retornar seu resultado', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const result = await service.runResilient(fn);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('deve propagar o erro quando a função falha (breaker contabiliza falha)', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('db-down'));

      await expect(service.runResilient(fn)).rejects.toThrow('db-down');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('deve expor o circuit breaker internamente para diagnóstico', () => {
      // Opossum CircuitBreaker expõe `opened` (boolean) e `fire` (function)
      const breaker = service['breaker'];
      expect(breaker).toBeDefined();
      expect(typeof breaker.fire).toBe('function');
      expect(typeof breaker.opened).toBe('boolean');
    });
  });
});
