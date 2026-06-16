---
title: TDD e ATDD na Stack
description: Test-Driven Development e Acceptance TDD aplicados ao NestJS+Jest+Supertest
last_updated: 2026-06-15
reviewer: analista-qualidade
related:
  - 01-estrategia-testes.md
  - 02-bdd-na-stack.md
  - 04-padroes-testes-nestjs.md
  - ../../AGENTS.md
---

# TDD e ATDD na Stack

> Como aplicamos o ciclo **Red → Green → Refactor** em código NestJS.

## 1. TDD em 3 frases

1. **Escreva o teste que falha** (Red) — para o comportamento que **ainda não existe**.
2. **Escreva o mínimo para passar** (Green) — código "óbvio", sem otimização.
3. **Refatore** mantendo verde — melhore nome, extraia método, elimine duplicação.

> **Por que funciona**: o teste que falha primeiro força você a **definir o contrato** antes da implementação. Sem isso, o design nasce acoplado ao que foi "fácil" codificar.

## 2. ATDD vs TDD (no nosso contexto)

| | ATDD (Acceptance TDD) | TDD (Unit) |
|--|----------------------|-----------|
| **Escopo** | 1 user story / endpoint | 1 método / branch |
| **Ferramenta** | `supertest` + NestJS app | Jest + mocks |
| **Velocidade** | 0.5-2 s/caso | < 5 ms/caso |
| **Foco** | "O usuário consegue fazer X?" | "Esta função retorna Y dado Z?" |
| **Localização** | `test/*.e2e-spec.ts` | `src/**/*.spec.ts` |
| **Quando quebra** | API/contrato mudou | Lógica interna mudou |

**ATDD primeiro**, **TDD depois**: o e2e-spec vermelho mostra que **a feature não existe**; o unit-spec vermelho mostra que **a unidade não existe**.

## 3. Ciclo na prática (exemplo real)

### Passo 1 — ATDD Red (e2e-spec)

```typescript
// test/usuarios.e2e-spec.ts
it('deve restaurar usuário soft-deleted', async () => {
  // BDD: features/usuarios.feature:Cenário: Restaurar usuário deletado
  // ATDD: test/usuarios.e2e-spec.ts
  const created = await request(app).post('/usuarios').send({...});
  await request(app).delete(`/usuarios/${created.body.id}`).expect(204);

  // ❌ Vai falhar: rota PATCH /usuarios/:id/restore não existe
  const restored = await request(app)
    .patch(`/usuarios/${created.body.id}/restore`)
    .expect(200);

  expect(restored.body.ativo).toBe(true);
});
```

### Passo 2 — TDD Red (unit-spec)

```typescript
// src/usuarios/application/services/usuarios.service.spec.ts
it('deve restaurar usuário setando ativo=true e deletedAt=null', async () => {
  mockRepo.findById.mockResolvedValue({ id: 1, ativo: false, deletedAt: new Date() });
  mockRepo.save.mockResolvedValue({ id: 1, ativo: true, deletedAt: null });

  const result = await service.restore(1);

  expect(result.ativo).toBe(true);
  expect(result.deletedAt).toBeNull();
  // ❌ Vai falhar: service.restore() não existe
});
```

### Passo 3 — Green (mínimo)

```typescript
// src/usuarios/application/services/usuarios.service.ts
async restore(id: number): Promise<Usuario> {
  const user = await this.repo.findById(id);  // findById lida com soft-deleted
  user.ativo = true;
  user.deletedAt = null;
  return this.repo.save(user);
}
```

### Passo 4 — Green (controller + rota)

```typescript
// src/usuarios/application/controllers/usuarios.controller.ts
@Patch(':id/restore')
@TemPermissao('UPDATE_USUARIOS')
async restore(@Param('id', ParseIntPipe) id: number) {
  return this.service.restore(id);
}
```

### Passo 5 — Refactor

Extrair `restoreSoftDeleted()` para `BaseService` se for reutilizado em outras entities.

## 4. Convenções do projeto

### 4.1 Onde cada teste vive

| Tipo | Localização | Convenção de nome |
|------|-------------|-------------------|
| Unit | `src/<modulo>/.../<arquivo>.spec.ts` | `<arquivo>.spec.ts` (co-localizado) |
| Integration | `src/<modulo>/.../<arquivo>.integration.spec.ts` | sufixo `.integration` |
| E2E | `test/<modulo>.e2e-spec.ts` | `<modulo>.e2e-spec.ts` |
| BDD | `features/<modulo>.feature` | `<modulo>.feature` (1:1 com módulo) |

### 4.2 Estrutura AAA (Arrange/Act/Assert)

```typescript
it('deve fazer X quando Y', async () => {
  // Arrange
  mockRepo.findById.mockResolvedValue(buildMockUsuario());
  const dto = { email: 'x@y.com' };

  // Act
  const result = await service.update(1, dto);

  // Assert
  expect(result.email).toBe('x@y.com');
  expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
});
```

> **Evite comentários AAA** explícitos (`// Arrange`) a menos que o teste seja longo. O **espaço em branco** entre as seções é a divisão visual.

### 4.3 Descreva em pt-BR, código em inglês

```typescript
describe('UsuariosService.buscarPorId', () => {
  it('deve retornar o usuário quando existir', async () => { ... });
  it('deve lançar NotFoundException quando não existir', async () => { ... });
});
```

> `describe` e `it` em **pt-BR** (alinhado com `AGENTS.md §5`). Identifiers de código em inglês.

### 4.4 Nomes de teste

Formato: **`deve [comportamento] quando [condição]`**

| ❌ Ruim | ✅ Bom |
|---------|--------|
| `it('test login')` | `it('deve autenticar e retornar tokens quando credenciais válidas')` |
| `it('error case')` | `it('deve lançar UnauthorizedException quando senha incorreta')` |
| `it('works')` | (apague — não diz nada) |

## 5. Padrões NestJS+Jest

### 5.1 Mock de dependências (padrão atual do projeto)

```typescript
const mockUsuarioRepository = {
  findById: jest.fn(),
  save: jest.fn(),
  // ... só os métodos que o service usa
};

const module: TestingModule = await Test.createTestingModule({
  providers: [
    UsuariosService,
    { provide: UsuarioRepository, useValue: mockUsuarioRepository },
  ],
}).compile();
```

> **Padrão atual**: `useValue` com objeto literal. **Alternativa** mais concisa: `useMocker(token => jest.fn())` (ver skill `nest-testing-mocks`).

### 5.2 Testar guards com `ExecutionContext` mockado

```typescript
const mockContext = {
  switchToHttp: () => ({
    getRequest: () => ({ user: { id: 1 }, headers: { 'x-empresa-id': 'uuid' } }),
  }),
  getHandler: () => ({}) as any,
  getClass: () => ({}) as any,
} as unknown as ExecutionContext;
```

### 5.3 Testar decorators (metadata)

```typescript
import { Reflector } from '@nestjs/core';
const reflector = new Reflector();

it('deve emitir metadata isPublic=true', () => {
  @Public()
  class TestClass {}
  const meta = reflector.get('isPublic', TestClass);
  expect(meta).toBe(true);
});
```

### 5.4 Testar E2E com FastifyAdapter

```typescript
let app: NestFastifyApplication;
beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false })
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
```

> **Por que FastifyAdapter explícito**: o `app.module.ts` registra middlewares no Fastify que precisam estar prontos antes do `app.init()`. Não use `app.getHttpServer()` sem `app.getHttpAdapter().getInstance().ready()`.

### 5.5 E2E: resetar estado entre testes

```typescript
beforeEach(async () => {
  await cleanDatabase(prisma);   // já existe em test/e2e-utils.ts
});
```

**Nunca** confie em ordem de testes. **Cada teste** começa com banco limpo.

## 6. Casos especiais desta stack

### 6.1 Multi-tenant: testar isolamento

```typescript
it('não deve retornar usuários de outra empresa', async () => {
  await createUsuario({ empresaId: 'A' });
  await createUsuario({ empresaId: 'B' });

  const result = await service.findAll('A');

  expect(result).toHaveLength(1);
  expect(result[0].empresaId).toBe('A');
});
```

### 6.2 Soft delete: testar que auto-filter funciona

```typescript
it('não deve retornar usuário soft-deleted em findById', async () => {
  await prisma.usuario.update({ where: { id: 1 }, data: { deletedAt: new Date() } });
  await expect(repo.findById(1)).resolves.toBeNull();
});
```

### 6.3 JWT: testar payload

```typescript
it('deve incluir empresas e perfis no payload', () => {
  const token = jwtService.sign({ sub: 1, empresas: [...] });
  const decoded = jwtService.decode(token) as any;
  expect(decoded.empresas).toHaveLength(2);
});
```

### 6.4 Throttler: não testar (é do NestJS, é mock no unit)

Não gaste tempo testando `@nestjs/throttler`. Confie na lib. Teste **seu uso** da lib (que você passou decorators corretamente).

## 7. Antipadrões de TDD

| ❌ Antipadrão | ✅ Faça em vez disso |
|---------------|----------------------|
| Escrever teste "para ver se passa" | Escrever teste que **sabe que vai falhar** (Red honesto) |
| Refatorar junto com Green | Refator **só** depois de Green |
| Testar implementação interna | Testar **comportamento observável** (retorno, side-effect) |
| Mockar o SUT | Mock **dependências**, nunca o SUT |
| "Vou adicionar testes depois" | Teste é **primeiro** commit, não último |
| Testar 1 método com 10 cenários em 1 `it` | 1 `it` por cenário, agrupar em `describe` |

## 8. Ciclo completo de uma feature (TL;DR)

```text
1. Ler/atualizar features/<modulo>.feature  (BDD)
2. Adicionar e2e-spec para o cenário         (ATDD Red)
3. Rodar e2e — ver falhar                   (Red honesto)
4. Para cada unidade envolvida:
   a. Adicionar unit-spec                     (TDD Red)
   b. Implementar mínimo                      (TDD Green)
   c. Refatorar                               (TDD Refactor)
5. Implementar controller + rota
6. Rodar e2e — ver passar                     (ATDD Green)
7. npm run validate:quick                     (verifica lint+build+unit)
8. Commit com mensagem referenciando BDD/SDD
```

## 9. Referências

- [AGENTS.md §6 — Workflow](../../AGENTS.md#6-workflow-de-desenvolvimento-ddd--bdd--sdd--atdd--tdd)
- [AGENTS.md §11 — Testing](../../AGENTS.md#11-testing)
- [`.agent/docs/04-padroes-testes-nestjs.md`](./04-padroes-testes-nestjs.md) — padrões NestJS+Jest
- [Kent Beck — Test-Driven Development by Example](https://www.amazon.com/Test-Driven-Development-Example-Kent-Beck/dp/0321146530)
