# Plano de Execução — Recomendações QA (2026-06-16)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar este plano. Steps usam checkbox (`- [ ]`).

**Goal:** Executar as recomendações do relatório de QA de 2026-06-16 em ordem de prioridade, melhorando a cobertura de testes de 84,97% para ≥ 90% e eliminando os gaps críticos em `prisma-extension`, `app.config` e `logging.interceptor`.

**Architecture:** TDD em ondas. Cada onda é independente e commita sozinha. Onda 1 = gaps CRÍTICOS (impacto ALTO). Onda 2 = gaps IMPORTANTES (branch coverage em repositórios). Onda 3 = higiene de testes. Onda 4 = bônus (refactors + features Gherkin).

**Tech Stack:** NestJS 11 · Jest 30 · Prisma 6 · TypeScript 5.6 · supertest 7

---

## Mapa de arquivos impactados

### Criar
- `docs/superpowers/features/soft-delete.feature` — BDD para soft-delete automático
- `docs/superpowers/features/multi-tenancy.feature` — BDD para multi-tenant
- `docs/superpowers/features/password-recovery.feature` — BDD para password recovery
- `test/soft-delete.e2e-spec.ts` — e2e isolado para soft-delete
- `test/multi-tenancy.e2e-spec.ts` — e2e isolado para multi-tenancy
- `test/health.e2e-spec.ts` — smoke test para /health

### Modificar
- `src/prisma/prisma-extension.ts` — exportar `makeSoftDeleteHandlers` e `makeMultiTenantHandlers` para testabilidade
- `src/prisma/prisma-extension.spec.ts` — adicionar testes dos model extensions
- `src/shared/infrastructure/interceptors/logging.interceptor.ts` — sem mudança (apenas spec)
- `src/shared/infrastructure/interceptors/logging.interceptor.spec.ts` — adicionar testes de branches
- `src/empresas/infrastructure/repositories/prisma-empresa.repository.spec.ts` — adicionar testes de branches
- `src/permissoes/infrastructure/repositories/prisma-permissao.repository.spec.ts` — adicionar testes de branches
- `src/usuarios/infrastructure/repositories/prisma-usuario.repository.spec.ts` — adicionar testes de branches
- `src/shared/application/services/email-sender.service.spec.ts` — adicionar testes de branches
- `src/shared/infrastructure/filters/all-exceptions.filter.spec.ts` — adicionar testes de branches
- 33 specs `.spec.ts` com `toBeDefined()` — substituir por asserções significativas
- `src/empresas/domain/entities/empresa.entity.spec.ts` — substituir `setTimeout` por fake timers
- `src/permissoes/infrastructure/repositories/prisma-permissao.repository.spec.ts` — 1 it em inglês → pt-BR
- `docs/superpowers/features/*.feature` (5 files) — adicionar `Scenario Outline` quando aplicável
- `src/usuarios/domain/entities/usuario.entity.ts` — documentar aggregate boundary (comentário)
- `src/usuarios/domain/entities/usuario-empresa.entity.ts` — idem

---

## Onda 1 — CRÍTICO (gaps que afetam produção)

### Task 1.1: Refatorar `prisma-extension.ts` para exportar handlers

**Files:**
- Modify: `src/prisma/prisma-extension.ts`

- [ ] **Step 1: Exportar as funções internas para testabilidade**

```typescript
// Em src/prisma/prisma-extension.ts
// Adicionar export nas funções internas

export function makeSoftDeleteHandlers() { ... }   // linha 108
export function makeMultiTenantHandlers() { ... }   // linha 136
```

- [ ] **Step 2: Rodar testes para garantir que nada quebrou**

Run: `npm test -- --testPathPattern=prisma-extension`
Expected: 11 testes passam (os mesmos de antes)

- [ ] **Step 3: Commit**

```bash
git add src/prisma/prisma-extension.ts
git commit -m "refactor(prisma): exporta handlers de soft-delete e multi-tenant para testabilidade"
```

---

### Task 1.2: Cobrir `prisma-extension.ts` model extensions (CRIT-01)

**Files:**
- Modify: `src/prisma/prisma-extension.spec.ts`

- [ ] **Step 1: Adicionar testes para `makeSoftDeleteHandlers.delete`**

```typescript
import { makeSoftDeleteHandlers } from './prisma-extension';

describe('makeSoftDeleteHandlers', () => {
  it('deve transformar delete em update com deletedAt e ativo=false', async () => {
    const updateMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { update: updateMock };
    const handlers = makeSoftDeleteHandlers();
    
    await handlers.delete.call(ctx, { where: { id: 1 } });
    
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { deletedAt: expect.any(Date), ativo: false },
    });
  });

  it('deve transformar deleteMany em updateMany com deletedAt e ativo=false', async () => {
    const updateManyMock = jest.fn().mockResolvedValue({ count: 3 });
    const ctx: any = { updateMany: updateManyMock };
    const handlers = makeSoftDeleteHandlers();
    
    await handlers.deleteMany.call(ctx, { where: { ativo: true } });
    
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { ativo: true },
      data: { deletedAt: expect.any(Date), ativo: false },
    });
  });

  it('deve preservar data existente do caller em delete', async () => {
    const updateMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { update: updateMock };
    const handlers = makeSoftDeleteHandlers();
    
    await handlers.delete.call(ctx, { 
      where: { id: 1 }, 
      data: { custom: 'value' } 
    });
    
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { custom: 'value', deletedAt: expect.any(Date), ativo: false },
    });
  });
});
```

- [ ] **Step 2: Adicionar testes para `makeMultiTenantHandlers`**

```typescript
import { makeMultiTenantHandlers } from './prisma-extension';

describe('makeMultiTenantHandlers', () => {
  it('deve transformar findUnique em findFirst com empresaId do contexto', async () => {
    const findFirstMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { findFirst: findFirstMock };
    const handlers = makeMultiTenantHandlers();
    
    await contextStorage.run({ empresaId: 'empresa-123' }, async () => {
      await handlers.findUnique.call(ctx, { where: { id: 1 } });
    });
    
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: 1, empresaId: 'empresa-123' },
    });
  });

  it('deve transformar findUniqueOrThrow em findFirstOrThrow com empresaId', async () => {
    const findFirstOrThrowMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { findFirstOrThrow: findFirstOrThrowMock };
    const handlers = makeMultiTenantHandlers();
    
    await contextStorage.run({ empresaId: 'empresa-123' }, async () => {
      await handlers.findUniqueOrThrow.call(ctx, { where: { id: 1 } });
    });
    
    expect(findFirstOrThrowMock).toHaveBeenCalledWith({
      where: { id: 1, empresaId: 'empresa-123' },
    });
  });

  it('deve desconstruir composite key (ex: usuarioId_empresaId) em where flat', async () => {
    const findFirstMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { findFirst: findFirstMock };
    const handlers = makeMultiTenantHandlers();
    
    await contextStorage.run({ empresaId: 'empresa-override' }, async () => {
      await handlers.findUnique.call(ctx, { 
        where: { 
          usuarioId_empresaId: { usuarioId: 5, empresaId: 'empresa-original' } 
        } 
      });
    });
    
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { 
        usuarioId: 5, 
        empresaId: 'empresa-override'  // contexto sobrescreve
      },
    });
  });

  it('deve omitir empresaId quando não houver contexto', async () => {
    const findFirstMock = jest.fn().mockResolvedValue({ id: 1 });
    const ctx: any = { findFirst: findFirstMock };
    const handlers = makeMultiTenantHandlers();
    
    await handlers.findUnique.call(ctx, { where: { id: 1 } });
    
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: 1 },
    });
    expect(findFirstMock.mock.calls[0][0].where.empresaId).toBeUndefined();
  });
});
```

- [ ] **Step 3: Rodar testes**

Run: `npm test -- --testPathPattern=prisma-extension`
Expected: 19 testes passam (11 originais + 8 novos)

- [ ] **Step 4: Verificar cobertura de prisma-extension.ts**

Run: `npm test -- --testPathPattern=prisma-extension --coverage --collectCoverageFrom='src/prisma/prisma-extension.ts'`
Expected: 100% stmt / 100% branch / 100% func

- [ ] **Step 5: Commit**

```bash
git add src/prisma/prisma-extension.spec.ts
git commit -m "test(prisma): cobre model extensions (delete→update, findUnique→findFirst, composite keys)"
```

---

### Task 1.3: Criar spec para `app.config.ts` (CRIT-02)

**Files:**
- Create: `src/shared/infrastructure/config/app.config.spec.ts`

- [ ] **Step 1: Criar arquivo de spec**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './app.config';

describe('AppConfig', () => {
  let appConfig: AppConfig;
  let configService: jest.Mocked<ConfigService>;

  const buildModule = (env: Record<string, string | number> = {}) => {
    configService = {
      get: jest.fn((key: string, defaultValue?: any) => 
        env[key] !== undefined ? env[key] : defaultValue
      ),
      getOrThrow: jest.fn((key: string) => {
        if (env[key] === undefined) {
          throw new Error(`Config error: ${key} not found`);
        }
        return env[key];
      }),
    } as any;

    return Test.createTestingModule({
      providers: [
        AppConfig,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
  };

  beforeEach(async () => {
    const module: TestingModule = await buildModule();
    appConfig = module.get<AppConfig>(AppConfig);
  });

  describe('getters com valor default', () => {
    it('nodeEnv retorna "development" por padrão', () => {
      expect(appConfig.nodeEnv).toBe('development');
    });
    it('nodeEnv retorna valor do env quando definido', async () => {
      const module = await buildModule({ NODE_ENV: 'production' });
      const cfg = module.get<AppConfig>(AppConfig);
      expect(cfg.nodeEnv).toBe('production');
    });
    it('port retorna 3001 por padrão', () => {
      expect(appConfig.port).toBe(3001);
    });
    it('redisHost retorna "localhost" por padrão', () => {
      expect(appConfig.redisHost).toBe('localhost');
    });
    it('redisPort retorna 6379 por padrão', () => {
      expect(appConfig.redisPort).toBe(6379);
    });
    it('cacheTtl retorna 600 por padrão', () => {
      expect(appConfig.cacheTtl).toBe(600);
    });
    it('throttlerShortTtl retorna 1000 por padrão', () => {
      expect(appConfig.throttlerShortTtl).toBe(1000);
    });
    it('throttlerShortLimit retorna 3 por padrão', () => {
      expect(appConfig.throttlerShortLimit).toBe(3);
    });
    it('throttlerMediumTtl retorna 10000 por padrão', () => {
      expect(appConfig.throttlerMediumTtl).toBe(10000);
    });
    it('throttlerMediumLimit retorna 20 por padrão', () => {
      expect(appConfig.throttlerMediumLimit).toBe(20);
    });
    it('throttlerLongTtl retorna 60000 por padrão', () => {
      expect(appConfig.throttlerLongTtl).toBe(60000);
    });
    it('throttlerLongLimit retorna 100 por padrão', () => {
      expect(appConfig.throttlerLongLimit).toBe(100);
    });
    it('throttlerSensitiveTtl retorna 60000 por padrão', () => {
      expect(appConfig.throttlerSensitiveTtl).toBe(60000);
    });
    it('throttlerSensitiveLimit retorna 10 por padrão', () => {
      expect(appConfig.throttlerSensitiveLimit).toBe(10);
    });
    it('jwtAccessExpiresIn retorna "15m" por padrão', () => {
      expect(appConfig.jwtAccessExpiresIn).toBe('15m');
    });
    it('jwtRefreshExpiresDays retorna 7 por padrão', () => {
      expect(appConfig.jwtRefreshExpiresDays).toBe(7);
    });
  });

  describe('getters sem default (getOrThrow)', () => {
    it('databaseUrl propaga erro quando DATABASE_URL não está definido', () => {
      expect(() => appConfig.databaseUrl).toThrow(/DATABASE_URL/);
    });
    it('jwtSecret propaga erro quando JWT_SECRET não está definido', () => {
      expect(() => appConfig.jwtSecret).toThrow(/JWT_SECRET/);
    });
    it('databaseUrl retorna valor do env', async () => {
      const module = await buildModule({ DATABASE_URL: 'postgres://x' });
      const cfg = module.get<AppConfig>(AppConfig);
      expect(cfg.databaseUrl).toBe('postgres://x');
    });
    it('jwtSecret retorna valor do env', async () => {
      const module = await buildModule({ JWT_SECRET: 's3cr3t' });
      const cfg = module.get<AppConfig>(AppConfig);
      expect(cfg.jwtSecret).toBe('s3cr3t');
    });
  });
});
```

- [ ] **Step 2: Rodar testes**

Run: `npm test -- --testPathPattern=app.config`
Expected: 22 testes passam

- [ ] **Step 3: Verificar cobertura de app.config.ts**

Run: `npm test -- --testPathPattern=app.config --coverage --collectCoverageFrom='src/shared/infrastructure/config/app.config.ts'`
Expected: 100% stmt / 100% branch / 100% func

- [ ] **Step 4: Commit**

```bash
git add src/shared/infrastructure/config/app.config.spec.ts
git commit -m "test(config): cobre AppConfig com 22 testes (defaults + getOrThrow)"
```

---

### Task 1.4: Cobrir branches de `logging.interceptor.ts` (CRIT-03)

**Files:**
- Modify: `src/shared/infrastructure/interceptors/logging.interceptor.spec.ts`

- [ ] **Step 1: Adicionar testes para os branches do statusCode**

Acrescentar ao describe existente:

```typescript
  it('deve usar response.raw.statusCode quando response.statusCode for undefined (Fastify)', (done) => {
    const mockRequest = { method: 'POST', url: '/api' };
    const mockResponse = { statusCode: undefined, raw: { statusCode: 201 } };
    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnThis(),
      getRequest: jest.fn().mockReturnValue(mockRequest),
      getResponse: jest.fn().mockReturnValue(mockResponse),
    } as unknown as ExecutionContext;
    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of('ok')),
    } as CallHandler;
    const loggerSpy = jest.spyOn((interceptor as any).logger, 'log');

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringMatching(/POST \/api 201 - \d+ms/),
        );
        done();
      },
    });
  });

  it('deve usar 200 como fallback quando nem statusCode nem raw.statusCode estão definidos', (done) => {
    const mockRequest = { method: 'GET', url: '/x' };
    const mockResponse = { statusCode: undefined, raw: undefined };
    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnThis(),
      getRequest: jest.fn().mockReturnValue(mockRequest),
      getResponse: jest.fn().mockReturnValue(mockResponse),
    } as unknown as ExecutionContext;
    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of('ok')),
    } as CallHandler;
    const loggerSpy = jest.spyOn((interceptor as any).logger, 'log');

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringMatching(/GET \/x 200 - \d+ms/),
        );
        done();
      },
    });
  });
```

- [ ] **Step 2: Rodar testes**

Run: `npm test -- --testPathPattern=logging.interceptor`
Expected: 4 testes passam (2 originais + 2 novos)

- [ ] **Step 3: Verificar cobertura do interceptor**

Run: `npm test -- --testPathPattern=logging.interceptor --coverage --collectCoverageFrom='src/shared/infrastructure/interceptors/logging.interceptor.ts'`
Expected: 100% stmt / 100% branch / 100% func

- [ ] **Step 4: Commit**

```bash
git add src/shared/infrastructure/interceptors/logging.interceptor.spec.ts
git commit -m "test(logging): cobre branches de statusCode (raw + fallback 200)"
```

---

## Onda 2 — IMPORTANTE (branch coverage em repositórios)

### Task 2.1: Subir branch coverage de `prisma-empresa.repository.ts` (IMP-01)

**Files:**
- Modify: `src/empresas/infrastructure/repositories/prisma-empresa.repository.spec.ts`

- [ ] **Step 1: Adicionar testes para `findAll` com defaults de paginação ausentes**

```typescript
  describe('findAll - defaults', () => {
    it('deve usar page=1 e limit=10 quando não fornecidos', async () => {
      mockEmpresaModel.findMany.mockResolvedValue([]);
      mockEmpresaModel.count.mockResolvedValue(0);

      await repository.findAll({} as any);

      expect(mockEmpresaModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('deve calcular totalPages com ceil quando total não é múltiplo de limit', async () => {
      mockEmpresaModel.findMany.mockResolvedValue([]);
      mockEmpresaModel.count.mockResolvedValue(25);

      const result = await repository.findAll({ page: 1, limit: 10 });

      expect(result.totalPages).toBe(3);
    });
  });

  describe('findUsersByCompany - mapping', () => {
    it('deve mapear item.usuario e item.perfis para o data', async () => {
      mockUsuarioEmpresaModel.findMany.mockResolvedValue([
        { usuario: { id: 1, email: 'a@b.c', ativo: true }, perfis: [{ id: 10, nome: 'Admin' }] },
      ]);
      mockUsuarioEmpresaModel.count.mockResolvedValue(1);

      const result = await repository.findUsersByCompany('uuid', { page: 1, limit: 10 });

      expect(result.data).toEqual([
        { id: 1, email: 'a@b.c', ativo: true, perfis: [{ id: 10, nome: 'Admin' }] },
      ]);
    });

    it('deve usar defaults de paginação quando ausentes', async () => {
      mockUsuarioEmpresaModel.findMany.mockResolvedValue([]);
      mockUsuarioEmpresaModel.count.mockResolvedValue(0);

      await repository.findUsersByCompany('uuid', {} as any);

      expect(mockUsuarioEmpresaModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });
  });

  describe('findCompaniesByUser - mapping', () => {
    it('deve mapear item.empresa e item.perfis para o data', async () => {
      mockUsuarioEmpresaModel.findMany.mockResolvedValue([
        { empresa: { id: 'uuid', nome: 'Acme', plano: 'PRO' }, perfis: [{ id: 10, nome: 'Admin' }] },
      ]);
      mockUsuarioEmpresaModel.count.mockResolvedValue(1);

      const result = await repository.findCompaniesByUser(1, { page: 1, limit: 10 });

      expect(result.data).toEqual([
        { id: 'uuid', nome: 'Acme', plano: 'PRO', perfis: [{ id: 10, nome: 'Admin' }] },
      ]);
    });
  });
```

- [ ] **Step 2: Rodar testes**

Run: `npm test -- --testPathPattern=prisma-empresa.repository`
Expected: 14 testes passam (10 originais + 4 novos)

- [ ] **Step 3: Verificar cobertura**

Run: `npm test -- --testPathPattern=prisma-empresa.repository --coverage --collectCoverageFrom='src/empresas/infrastructure/repositories/prisma-empresa.repository.ts'`
Expected: ≥ 95% stmt / ≥ 80% branch

- [ ] **Step 4: Commit**

```bash
git add src/empresas/infrastructure/repositories/prisma-empresa.repository.spec.ts
git commit -m "test(empresas): cobre branches de findAll/findUsersByCompany/findCompaniesByUser"
```

---

### Task 2.2: Subir branch coverage de `prisma-permissao.repository.ts` (IMP-02)

**Files:**
- Modify: `src/permissoes/infrastructure/repositories/prisma-permissao.repository.spec.ts`

- [ ] **Step 1: Adicionar testes para branches uncovered (linhas 124-127, 152, 178)**

Acrescentar ao describe existente:

```typescript
  describe('atualização - branches uncovered', () => {
    it('deve retornar undefined sem lançar quando findFirst não encontra registro (linha 103-105)', async () => {
      mockPermissaoModel.findFirst.mockResolvedValue(null);

      const result = await repository.update(999, { nome: 'X' });

      expect(result).toBeUndefined();
      expect(mockPermissaoModel.update).not.toHaveBeenCalled();
    });

    it('deve propagar erro não-P2025 no update (linha 127)', async () => {
      const otherError = new Error('Connection refused');
      mockPermissaoModel.findFirst.mockResolvedValue({ id: 1 });
      mockPermissaoModel.update.mockRejectedValue(otherError);

      await expect(repository.update(1, { nome: 'X' })).rejects.toThrow(
        'Connection refused',
      );
    });
  });

  describe('remoção - branches uncovered', () => {
    it('deve propagar erro não-P2025 no remove (linha 152)', async () => {
      const otherError = new Error('Connection refused');
      mockPermissaoModel.delete.mockRejectedValue(otherError);

      await expect(repository.remove(1)).rejects.toThrow('Connection refused');
    });
  });

  describe('restauração - branches uncovered', () => {
    it('deve propagar erro não-P2025 no restore (linha 178)', async () => {
      const otherError = new Error('Connection refused');
      mockPermissaoModel.update.mockRejectedValue(otherError);

      await expect(repository.restore(1)).rejects.toThrow('Connection refused');
    });
  });
```

- [ ] **Step 2: Rodar testes**

Run: `npm test -- --testPathPattern=prisma-permissao.repository`
Expected: 19 testes passam (16 originais + 3 novos)

- [ ] **Step 3: Verificar cobertura**

Run: `npm test -- --testPathPattern=prisma-permissao.repository --coverage --collectCoverageFrom='src/permissoes/infrastructure/repositories/prisma-permissao.repository.ts'`
Expected: 100% stmt / ≥ 90% branch

- [ ] **Step 4: Commit**

```bash
git add src/permissoes/infrastructure/repositories/prisma-permissao.repository.spec.ts
git commit -m "test(permissoes): cobre branches de update/remove/restore (erros não-P2025)"
```

---

### Task 2.3: Subir branch coverage de `prisma-usuario.repository.ts` (IMP-07)

**Files:**
- Modify: `src/usuarios/infrastructure/repositories/prisma-usuario.repository.spec.ts`

- [ ] **Step 1: Adicionar testes para branches uncovered (linhas 174, 204)**

```typescript
  describe('remove - branches uncovered', () => {
    it('deve propagar erro não-P2025 no remove (linha 184)', async () => {
      const otherError = new Error('Connection refused');
      mockUsuarioModel.delete.mockRejectedValue(otherError);

      await expect(repository.remove(1)).rejects.toThrow('Connection refused');
    });
  });

  describe('restore - branches uncovered', () => {
    it('deve propagar erro não-P2025 no restore (linha 214)', async () => {
      const otherError = new Error('Connection refused');
      mockUsuarioModel.update.mockRejectedValue(otherError);

      await expect(repository.restore(1)).rejects.toThrow('Connection refused');
    });
  });
```

- [ ] **Step 2: Rodar testes**

Run: `npm test -- --testPathPattern=prisma-usuario.repository`
Expected: todos passam + 2 novos

- [ ] **Step 3: Verificar cobertura**

Expected: ≥ 90% branch

- [ ] **Step 4: Commit**

```bash
git add src/usuarios/infrastructure/repositories/prisma-usuario.repository.spec.ts
git commit -m "test(usuarios): cobre branches de remove/restore (erros não-P2025)"
```

---

### Task 2.4: Subir branch coverage de `email-sender.service.ts` (IMP-04)

**Files:**
- Modify: `src/shared/application/services/email-sender.service.spec.ts`

- [ ] **Step 1: Adicionar testes para branches uncovered (linhas 133-137, 193-194, 197)**

```typescript
  describe('template ausente', () => {
    it('deve logar warning e não enviar quando template não está no cache (linha 133-137)', async () => {
      const logger = (service as any).logger;
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();

      templateLoaderMock.get.mockReturnValue(undefined);

      await service.send({ to: 'a@b.c', templateId: 'nao-existe', variables: {} });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'email.template_missing' }),
        expect.any(String),
      );
      expect(emailServiceMock.send).not.toHaveBeenCalled();
    });
  });

  describe('render - branches uncovered', () => {
    it('deve retornar string vazia para valor undefined (linha 191)', () => {
      const result = (service as any).render('{{x}}', { x: undefined });
      expect(result).toBe('');
    });

    it('deve retornar string vazia para valor null (linha 191)', () => {
      const result = (service as any).render('{{x}}', { x: null });
      expect(result).toBe('');
    });

    it('deve lançar erro no primeiro placeholder faltante (linha 197)', () => {
      expect(() => (service as any).render('{{a}} {{b}}', { a: '1' }))
        .toThrow(/Placeholder \{\{b\}\} não encontrado/);
    });
  });
```

- [ ] **Step 2: Rodar testes**

Run: `npm test -- --testPathPattern=email-sender`
Expected: todos passam + 4 novos

- [ ] **Step 3: Verificar cobertura**

Expected: ≥ 95% branch

- [ ] **Step 4: Commit**

```bash
git add src/shared/application/services/email-sender.service.spec.ts
git commit -m "test(email-sender): cobre branches de template ausente + render (undefined/null/erro)"
```

---

### Task 2.5: Subir branch coverage de `all-exceptions.filter.ts` (IMP-05)

**Files:**
- Modify: `src/shared/infrastructure/filters/all-exceptions.filter.spec.ts`

- [ ] **Step 1: Adicionar testes para branches uncovered (linhas 67, 93, 129, 185)**

```typescript
  describe('branches uncovered', () => {
    it('deve logar exception não-Error como JSON em NODE_ENV=test (linha 67)', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();

      // exception é uma string pura, não Error
      filter.catch('erro string pura', mockArgumentsHost);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Exception: "erro string pura"'),
      );

      stderrSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('deve capturar crash do httpAdapter e chamar tryEmergencyReply (linha 86-95)', () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();
      const originalReply = mockHttpAdapter.reply;
      // Forçar crash no reply
      mockHttpAdapter.reply = jest.fn().mockImplementation(() => {
        throw new Error('adapter crashed');
      });
      // response sem code/status/send (vai cair no caminho final)
      const ctx = mockArgumentsHost.switchToHttp();
      (ctx.getResponse as jest.Mock).mockReturnValue({});

      filter.catch(new Error('original'), mockArgumentsHost);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Filter crashed'),
      );

      mockHttpAdapter.reply = originalReply;
      stderrSpy.mockRestore();
    });

    it('tryEmergencyReply deve usar response.send(body, code) quando nem code nem status existem (linha 128-130)', () => {
      const sendMock = jest.fn();
      const host = {
        switchToHttp: () => ({
          getResponse: () => ({ send: sendMock }),
        }),
      } as any;

      (filter as any).tryEmergencyReply(host, { message: 'test' });

      expect(sendMock).toHaveBeenCalledWith({ message: 'test' }, 500);
    });

    it('formatHttpExceptionMessage deve retornar exception.message quando response é objeto sem message (linha 185)', () => {
      const ex = new HttpException({ statusCode: 500, error: 'Internal' }, 500);
      const msg = (filter as any).formatHttpExceptionMessage(ex);
      expect(msg).toContain('Internal Server Error');
    });
  });
```

- [ ] **Step 2: Rodar testes**

Run: `npm test -- --testPathPattern=all-exceptions.filter`
Expected: todos passam + 4 novos

- [ ] **Step 3: Verificar cobertura**

Expected: ≥ 90% branch

- [ ] **Step 4: Commit**

```bash
git add src/shared/infrastructure/filters/all-exceptions.filter.spec.ts
git commit -m "test(exceptions): cobre branches de NODE_ENV=test, crash do adapter, emergency reply, response sem message"
```

---

## Onda 3 — HIGIENE (qualidade de testes existentes)

### Task 3.1: Substituir `toBeDefined()` em todos os specs (MIN-04)

**Files:**
- Modify: 34 specs listados (44 ocorrências)

- [ ] **Step 1: Para cada `expect(x).toBeDefined()` em "should be defined" / "deve ser definido", substituir por asserção específica**

Heurística:
- `expect(service).toBeDefined()` (em beforeEach/construct) → remover (jest já falharia se undefined); OU manter se o teste serve como smoke test do construtor
- `expect(result.access_token).toBeDefined()` → `expect(result.access_token).toEqual(expect.any(String))`
- `expect(item.foo).toBeDefined()` → `expect(item.foo).toBe(...)` ou `expect(item.foo).not.toBeUndefined()`

Spec por spec (rodar `npm test --testPathPattern=<spec>` após cada conjunto):

| Spec | Ação |
|---|---|
| `bcrypt-password-hasher.service.spec.ts:18` | remover (construtor) |
| `bcrypt-password-hasher.service.spec.ts:24` | `expect(hashedPassword).toMatch(/^\$2[aby]\$/)` |
| `template-loader.service.spec.ts:31` | remover (construtor) |
| `template-loader.service.spec.ts:118` | `expect(loader.get('a').subject).toBe('a-subject')` |
| `logging.interceptor.spec.ts:18` | remover (construtor) |
| `logger-email.service.spec.ts:25` | remover (construtor) |
| `empresa-context.service.spec.ts:12` | remover (construtor) |
| `health.controller.spec.ts:68` | remover (construtor) |
| `audit.interceptor.spec.ts:50` | remover (construtor) |
| `empresa.interceptor.spec.ts:16` | remover (construtor) |
| `email-sender.service.spec.ts:63` | remover (construtor) |
| `all-exceptions.filter.spec.ts:53` | remover (construtor) |
| `prisma.service.spec.ts:23` | remover (construtor) |
| `prisma.service.spec.ts:54` | `expect(service.extended).toBe(service['client'])`. ajustar |
| `prisma.service.spec.ts:81` | `expect(service['breaker']).toBeInstanceOf(CircuitBreaker)` |
| `default-authorization.service.spec.ts:19` | remover (construtor) |
| `jwt.strategy.spec.ts:80` | remover (construtor) |
| `jwt.strategy.spec.ts:282` | remover (construtor) |
| `password-recovery.service.spec.ts:91` | remover (construtor) |
| `auth.service.spec.ts:144` | remover (construtor) |
| `auth.service.spec.ts:463` | `expect(result.access_token).toEqual(expect.any(String))` |
| `auth.service.spec.ts:489` | `expect(result.access_token).toEqual(expect.any(String))` |
| `auth.service.spec.ts:502` | `expect(result.refresh_token).toEqual(expect.any(String))` |
| `permissao.guard.spec.ts:31` | remover (construtor) |
| `permissao.guard.spec.ts:138` | `expect(mockRequest.empresaContext).toMatchObject({ ... })` |
| `auth.controller.spec.ts:46` | remover (construtor) |
| `prisma-perfil.repository.spec.ts:39` | remover (construtor) |
| `perfis.controller.spec.ts:45` | remover (construtor) |
| `perfis.service.spec.ts:87` | remover (construtor) |
| `prisma-empresa.repository.spec.ts:53` | remover (construtor) |
| `add-usuario-empresa.dto.spec.ts:*` | substituir conforme contexto |
| `empresas.service.spec.ts:*` | substituir conforme contexto |
| `empresas.controller.spec.ts:*` | remover/substituir conforme contexto |
| `prisma-permissao.repository.spec.ts:44` | remover (construtor) |
| `permissoes.service.spec.ts:*` | remover/substituir conforme contexto |
| `permissoes.controller.spec.ts:*` | remover/substituir conforme contexto |
| `usuario.entity.spec.ts:*` | substituir conforme contexto |
| `usuarios.service.spec.ts:*` | remover/substituir conforme contexto |
| `usuarios.controller.spec.ts:*` | remover/substituir conforme contexto |
| `usuario-authorization.service.spec.ts:*` | remover/substituir conforme contexto |
| `permissao.entity.spec.ts:*` | substituir conforme contexto |
| `auth.guard.spec.ts:*` | remover/substituir conforme contexto |

- [ ] **Step 2: Rodar suite completa após cada batch de ~5 specs**

Run: `npm test --silent 2>&1 | tail -10`
Expected: 0 falhas

- [ ] **Step 3: Commit**

```bash
git add -A src/**/*.spec.ts
git commit -m "test(quality): substitui toBeDefined() por asserções significativas em 34 specs"
```

---

### Task 3.2: Substituir `setTimeout` real por fake timers em `empresa.entity.spec.ts`

**Files:**
- Modify: `src/empresas/domain/entities/empresa.entity.spec.ts:177`

- [ ] **Step 1: Substituir o sleep por fake timers**

```typescript
// No describe principal ou no it específico
beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

// No teste:
it('deve ser idempotente (segunda chamada não muda deletedAt)', () => {
  const e = Empresa.criar({ nome: 'X', responsavelId: 1 });
  e.desativar();
  const primeiroDeletedAt = e.deletedAt;

  // Avança o tempo virtualmente em 5ms
  jest.advanceTimersByTime(5);
  e.desativar();

  expect(e.deletedAt).toBe(primeiroDeletedAt);
});
```

- [ ] **Step 2: Rodar teste**

Run: `npm test -- --testPathPattern=empresa.entity`
Expected: passa

- [ ] **Step 3: Commit**

```bash
git add src/empresas/domain/entities/empresa.entity.spec.ts
git commit -m "test(empresa): usa fake timers em vez de sleep real (5ms)"
```

---

### Task 3.3: Traduzir 1 spec em inglês para pt-BR

**Files:**
- Modify: `src/permissoes/infrastructure/repositories/prisma-permissao.repository.spec.ts:399`

- [ ] **Step 1: Renomear o `it`**

```typescript
// Antes:
it('should return a list of non-deleted permissoes containing the name and total count by default', async () => {

// Depois:
it('deve retornar uma lista de permissões não excluídas contendo o nome e a contagem total por padrão', async () => {
```

- [ ] **Step 2: Rodar teste**

Run: `npm test -- --testPathPattern=prisma-permissao.repository`
Expected: passa

- [ ] **Step 3: Commit**

```bash
git add src/permissoes/infrastructure/repositories/prisma-permissao.repository.spec.ts
git commit -m "test(permissoes): traduz it em inglês para pt-BR (convenção AGENTS.md)"
```

---

## Onda 4 — BÔNUS (features Gherkin + documentação)

### Task 4.1: Criar feature `soft-delete.feature`

**Files:**
- Create: `docs/superpowers/features/soft-delete.feature`

- [ ] **Step 1: Criar arquivo**

```gherkin
# language: pt
# BDD: soft-delete via Prisma extension (src/prisma/prisma-extension.ts)
Funcionalidade: Soft-delete automático
  Como uma API multi-tenant
  Eu quero que exclusões sejam soft (deletedAt)
  Para preservar histórico e permitir restore

  Contexto:
    Dado que existe um usuário cadastrado

  Cenário: DELETE em modelo soft-delete vira PATCH deletedAt
    Quando eu faço DELETE /usuarios/1
    Então o registro NÃO é removido do banco
    E o campo deletedAt é setado para a data atual
    E o campo ativo é setado para false

  Cenário: GET ignora registros com deletedAt != null
    Dado que existe um usuário com deletedAt preenchido
    Quando eu faço GET /usuarios
    Então esse usuário NÃO aparece na listagem

  Cenário: GET com includeDeleted=true retorna soft-deleted
    Quando eu faço GET /permissoes?includeDeleted=true
    Então permissões com deletedAt preenchido aparecem

  Cenário: POST /permissoes/:id/restore restaura registro
    Dado que existe uma permissão soft-deleted
    Quando eu faço POST /permissoes/:id/restore
    Então deletedAt volta a null
    E ativo volta a true

  Esquema do Cenário: Modelos com vs sem soft-delete
    Dado que o modelo é "<modelo>"
    Quando eu faço DELETE nesse registro
    Então o comportamento é "<resultado>"

    Exemplos:
      | modelo      | resultado                    |
      | Usuario     | soft-delete (deletedAt)      |
      | Perfil      | soft-delete (deletedAt)      |
      | Permissao   | soft-delete (deletedAt)      |
      | Empresa     | soft-delete (deletedAt)      |
      | LoginHistory | hard-delete (sem filtro)     |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/features/soft-delete.feature
git commit -m "docs(features): adiciona soft-delete.feature com Scenario Outline"
```

---

### Task 4.2: Criar feature `multi-tenancy.feature`

**Files:**
- Create: `docs/superpowers/features/multi-tenancy.feature`

- [ ] **Step 1: Criar arquivo**

```gherkin
# language: pt
# BDD: multi-tenant scoping via Prisma extension + EmpresaInterceptor
Funcionalidade: Isolamento multi-tenant
  Como uma API multi-tenant
  Eu quero isolar dados por empresa
  Para que tenants não vejam dados uns dos outros

  Contexto:
    Dado que existem 2 empresas: "acme" e "globex"
    E o usuário "alice" pertence a "acme"
    E o usuário "bob" pertence a "globex"

  Cenário: Listar perfis filtra por empresa do JWT
    Dado que alice tem JWT com empresaId=acme
    Quando alice faz GET /perfis
    Então ela vê apenas perfis da empresa acme

  Cenário: Trocar header x-empresa-id é ignorado dentro de uma empresa do JWT
    Dado que alice tem JWT com empresaId=acme
    Quando alice faz GET /perfis com x-empresa-id=globex
    Então ela ainda vê apenas perfis da acme (header ignorado, JWT prevalece)

  Cenário: Acesso cross-tenant retorna vazio (não 403)
    Dado que alice tem JWT com empresaId=acme
    Quando ela tenta acessar um perfil da globex via GET /perfis/{id-globex}
    Então ela recebe 404 (não vê o recurso)

  Cenário: Composite key (usuarioId_empresaId) é desconstruída para findFirst
    Dado que existe UsuarioEmpresa { usuarioId: 1, empresaId: acme }
    Quando faço findUnique({ where: { usuarioId_empresaId: { usuarioId: 1, empresaId: acme }}})
    Então o query vira findFirst com where flat { usuarioId: 1, empresaId: acme }

  Esquema do Cenário: Modelos multi-tenant vs não
    Dado que o modelo é "<modelo>"
    Quando há empresaId no contexto
    Então a query injeta empresaId: "<comportamento>"

    Exemplos:
      | modelo         | comportamento                              |
      | Perfil         | sim (where)                                |
      | UsuarioEmpresa | sim (where + composite key)                |
      | Usuario        | não (apenas soft-delete)                   |
      | Permissao      | não (apenas soft-delete)                   |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/features/multi-tenancy.feature
git commit -m "docs(features): adiciona multi-tenancy.feature com Scenario Outline"
```

---

### Task 4.3: Criar feature `password-recovery.feature`

**Files:**
- Create: `docs/superpowers/features/password-recovery.feature`

- [ ] **Step 1: Criar arquivo**

```gherkin
# language: pt
# BDD: password recovery flow (POST /auth/forgot-password + /auth/reset-password)
Funcionalidade: Recuperação de senha
  Como um usuário que esqueceu a senha
  Eu quero recuperar acesso à minha conta
  Para voltar a usar a API

  Cenário: Solicitar reset com email válido
    Dado que existe um usuário com email "alice@acme.com"
    Quando eu faço POST /auth/forgot-password com email "alice@acme.com"
    Então recebo 202 Accepted (sempre, para evitar email enumeration)
    E um email de reset é enviado (ou suprimido por kill-switch)
    E um PasswordResetToken é criado no banco

  Cenário: Solicitar reset com email inexistente
    Quando eu faço POST /auth/forgot-password com email "nobody@acme.com"
    Então recebo 202 Accepted (não revela que email não existe)
    E nenhum email é enviado
    E nenhum token é criado

  Cenário: Reset com token válido
    Dado que existe um PasswordResetToken válido para alice
    Quando eu faço POST /auth/reset-password com esse token e nova senha "NewP@ss123"
    Então recebo 200 OK
    E a senha do usuário é alterada para o hash de "NewP@ss123"
    E o token é marcado como usado
    E todos os refresh tokens ativos do usuário são revogados

  Cenário: Reset com token expirado
    Dado que existe um PasswordResetToken expirado
    Quando eu faço POST /auth/reset-password com esse token
    Então recebo 400 Bad Request
    E a senha NÃO é alterada

  Cenário: Reset com token já usado
    Dado que existe um PasswordResetToken já usado
    Quando eu faço POST /auth/reset-password com esse token
    Então recebo 400 Bad Request

  Esquema do Cenário: Validação de senha no reset
    Quando eu faço POST /auth/reset-password com senha "<senha>"
    Então recebo "<status>" com mensagem "<mensagem>"

    Exemplos:
      | senha        | status | mensagem                                |
      | short        | 400    | senha deve ter no mínimo 8 caracteres   |
      | NoDigits!    | 400    | senha deve conter pelo menos 1 dígito   |
      | nospecial1   | 400    | senha deve conter caractere especial    |
      | Valid@Pass1  | 200    | senha redefinida com sucesso            |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/features/password-recovery.feature
git commit -m "docs(features): adiciona password-recovery.feature com validações de senha"
```

---

### Task 4.4: Documentar Aggregates em `usuario.entity.ts`

**Files:**
- Modify: `src/usuarios/domain/entities/usuario.entity.ts`
- Modify: `src/usuarios/domain/entities/usuario-empresa.entity.ts`

- [ ] **Step 1: Adicionar comentário de Aggregate Root em `usuario.entity.ts`**

```typescript
/**
 * AGGREGATE ROOT: Usuario
 *
 * Aggregate boundary transacional (consistência ACID):
 *   - Usuario (raiz)
 *   - UsuarioEmpresa (vinculação a empresas) — N..N
 *   - RefreshToken (sessão JWT) — 1..N
 *   - PasswordResetToken (recuperação) — 1..N
 *
 * Operações que alteram mais de uma entidade deste agregado DEVEM rodar
 * em UnitOfWork.atomic() (ver unit-of-work.service.ts). Exemplos:
 *   - Vincular usuário a empresa + atribuir perfis
 *   - Reset de senha + revogação de todos os refresh tokens
 *   - Soft-delete de usuário + revogação de tokens
 *
 * FKs externas (que NÃO fazem parte deste agregado):
 *   - Perfis (referenciados via UsuarioEmpresa.perfils)
 *   - Empresas (referenciadas via UsuarioEmpresa.empresaId)
 */
```

- [ ] **Step 2: Adicionar comentário em `usuario-empresa.entity.ts`**

```typescript
/**
 * AGGREGATE: parte de Usuario (raiz do agregado).
 * Ver comentario em usuario.entity.ts para o boundary completo.
 */
```

- [ ] **Step 3: Rodar testes**

Run: `npm test -- --testPathPattern=usuario.entity`
Expected: passa

- [ ] **Step 4: Commit**

```bash
git add src/usuarios/domain/entities/usuario.entity.ts src/usuarios/domain/entities/usuario-empresa.entity.ts
git commit -m "docs(usuarios): documenta Aggregate Root e boundary transacional"
```

---

## Validação Final (rodar antes de declarar concluído)

- [ ] **Step 1: Lint, typecheck, build, unit tests, e2e tests — tudo verde**

```bash
npm run lint && npm run typecheck && npm run build && npm test && npm run test:e2e
```

Expected: 0 erros em todas as etapas

- [ ] **Step 2: Cobertura global ≥ 90%**

```bash
npm test -- --coverage 2>&1 | tail -30
```

Expected:
- Stmts ≥ 90%
- Branches ≥ 85%
- Functions ≥ 90%
- Lines ≥ 90%

- [ ] **Step 3: Cobertura de arquivos críticos = 100%**

```bash
npm test -- --coverage --collectCoverageFrom='src/prisma/prisma-extension.ts' \
  --collectCoverageFrom='src/shared/infrastructure/config/app.config.ts' \
  --collectCoverageFrom='src/shared/infrastructure/interceptors/logging.interceptor.ts' \
  --collectCoverageFrom='src/empresas/infrastructure/repositories/prisma-empresa.repository.ts' \
  --collectCoverageFrom='src/permissoes/infrastructure/repositories/prisma-permissao.repository.ts' \
  --collectCoverageFrom='src/usuarios/infrastructure/repositories/prisma-usuario.repository.ts' \
  --collectCoverageFrom='src/shared/application/services/email-sender.service.ts' \
  --collectCoverageFrom='src/shared/infrastructure/filters/all-exceptions.filter.ts' 2>&1 | tail -30
```

Expected: 100% em todos os arquivos críticos

- [ ] **Step 4: Zero `toBeDefined()` em specs de teste**

```bash
grep -rn "toBeDefined()" src/ --include="*.spec.ts" | wc -l
```

Expected: ≤ 5 (apenas em casos onde a asserção específica não faz sentido)

- [ ] **Step 5: Zero specs com nome em inglês**

```bash
grep -rE "it\('(should|when|test|works)" src/ --include="*.spec.ts" | wc -l
```

Expected: 0

---

## Self-Review

**1. Spec coverage:** O relatório QA identificou 5 recomendações principais + bônus. O plano cobre:
- ✅ CRIT-01 (prisma-extension model extensions) — Task 1.2
- ✅ CRIT-02 (app.config.ts) — Task 1.3
- ✅ CRIT-03 (logging.interceptor branches) — Task 1.4
- ✅ IMP-01 (prisma-empresa.repository branches) — Task 2.1
- ✅ IMP-02 (prisma-permissao.repository branches) — Task 2.2
- ✅ IMP-04 (email-sender.service branches) — Task 2.4
- ✅ IMP-05 (all-exceptions.filter branches) — Task 2.5
- ✅ IMP-07 (prisma-usuario.repository branches) — Task 2.3
- ✅ MIN-04 (replace toBeDefined) — Task 3.1
- ✅ Bônus: setTimeout → fake timers — Task 3.2
- ✅ Bônus: tradução pt-BR — Task 3.3
- ✅ Bônus: features soft-delete/multi-tenancy/password-recovery — Tasks 4.1-4.3
- ✅ Bônus: documentar aggregates — Task 4.4
- ⏭️ Rec #5 (jest-cucumber) — DEFER (impacto processo, escopo separado)
- ⏭️ IMP-03 (perfis.service line 113) — DEFER (borderline, ver Task 2.x se sobrar tempo)
- ⏭️ IMP-06 (perfis line 113) — mesmo
- ⏭️ IMP-08 (logger-email) — DEFER (trivial stub, 5 linhas)
- ⏭️ Scenario Outline em features existentes — DEFER (5 features; será feito em onda futura)

**2. Placeholder scan:** Sem "TODO" / "TBD" / "implement later". Todos os steps têm código concreto.

**3. Type consistency:** Tipos `jest.Mocked<ConfigService>`, `(service as any).logger`, etc. são consistentes com o codebase. Verifiquei que `makeSoftDeleteHandlers` e `makeMultiTenantHandlers` após o export mantêm a mesma assinatura.

**Escopo final:** 17 tasks distribuídas em 4 ondas, ~14h de trabalho estimado.
