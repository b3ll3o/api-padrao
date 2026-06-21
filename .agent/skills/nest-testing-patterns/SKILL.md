---
name: nest-testing-patterns
description: Use when writing or reviewing unit/e2e tests for NestJS controllers, services, guards, interceptors, decorators, DTOs, pipes, strategies, or Prisma repositories — pick the right mocking strategy, fastify adapter, and Reflector spy for each unit type.
---

# NestJS Testing Patterns

Recipes prontas para cada unidade testável em NestJS 11 + Jest 30 + Supertest 7. Use quando estiver **escrevendo** ou **revisando** teste para qualquer unidade NestJS.

## When to Use

Sintomas: "como mocko o repositório?", "test de guard não reconhece metadata", "FastifyAdapter quebra no `app.init()`", "DTO valida mas teste passa mesmo assim".

Não use para: configurar a stack (`package.json`), escolher runner, ou CI. Isso é **procedimento**, vai em workflow.

## Quick Reference — qual padrão usar

| Unidade | Mock principal | Helper crítico |
|---------|---------------|----------------|
| Service | Repository | `jest.clearAllMocks()` no `afterEach` |
| Controller | Service (useValue) | testar só **pipes/decorators** + switch de comportamento |
| Guard | Reflector (jest.spyOn) + ExecutionContext | sempre testar caminho "sem metadata" |
| Interceptor | `next.handle()` com `of()` | testar efeito observável, não rxjs |
| Decorator | `new Reflector().get()` | cobrir **emissão** e **parâmetros** |
| DTO | `validate()` + `plainToInstance()` | 1 teste por constraint do class-validator |
| Pipe | `transform(value, metadata)` | boundary: válido, NaN, vazio |
| Strategy | método `validate(payload)` | happy + "usuário não existe" |
| Repository | DB real (`cleanDatabase`) **ou** `mockDeep<PrismaClient>()` | preferir DB real para testar prisma-extension |
| E2E | `supertest(app.getHttpServer())` | `app.getHttpAdapter().getInstance().ready()` antes de `request()` |

## Core Patterns

### Service — happy + not-found

```typescript
const mockRepo = { findById: jest.fn() };
const module = await Test.createTestingModule({
  providers: [UsuariosService, { provide: UsuarioRepository, useValue: mockRepo }],
}).compile();
service = module.get(UsuariosService);
jest.clearAllMocks();   // before/after each

it('deve retornar usuário quando existir', async () => {
  mockRepo.findById.mockResolvedValue(buildMockUsuario());
  expect(await service.findById(1)).toEqual(buildMockUsuario());
});
it('deve lançar NotFoundException quando não existir', async () => {
  mockRepo.findById.mockResolvedValue(null);
  await expect(service.findById(999)).rejects.toThrow(NotFoundException);
});
```

### Guard — Reflector spy + ExecutionContext

```typescript
const mockContext = (user: any, empresaId: string) => ({
  switchToHttp: () => ({ getRequest: () => ({ user, headers: { 'x-empresa-id': empresaId } }) }),
  getHandler: () => function () {},
  getClass: () => class {},
}) as unknown as ExecutionContext;

it('nega com ForbiddenException', async () => {
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['READ_X']);
  mockAuthz.can.mockResolvedValue(false);
  await expect(guard.canActivate(mockContext({ id: 1 }, 'emp-1'))).rejects.toThrow(ForbiddenException);
});
it('permite sem @TemPermissao (caminho neutro)', async () => {
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
  await expect(guard.canActivate(mockContext({ id: 1 }, 'emp-1'))).resolves.toBe(true);
  expect(mockAuthz.can).not.toHaveBeenCalled();
});
```

### Decorator — Reflector.get direto

```typescript
it('deve emitir metadata isPublic=true', () => {
  @Public() class TestClass {}
  expect(new Reflector().get('isPublic', TestClass)).toBe(true);
});
```

### DTO — validate + plainToInstance

```typescript
const errors = await validate(plainToInstance(CreateUsuarioDto, payload));
expect(errors.map(e => e.property)).toContain('email');
```

### E2E — FastifyAdapter + cleanDatabase

```typescript
app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
await app.init();
await app.getHttpAdapter().getInstance().ready();   // ← necessário p/ Fastify
beforeEach(async () => { await cleanDatabase(prisma); });
```

## Common Mistakes

| ❌ Errado | ✅ Certo |
|----------|---------|
| `app.init()` sem `app.getHttpAdapter().getInstance().ready()` | chamar `ready()` antes do `supertest` |
| Mockar o SUT (a classe que está testando) | Mockar **dependências** |
| `expect(result).toBe(true)` sem contexto | asserção sobre **comportamento** (retorno, side-effect) |
| Testar `if` privado | testar **efeito observável** |
| Esquecer `jest.clearAllMocks()` | sempre após cada teste |
| `it('test login')` | `it('deve autenticar com credenciais válidas')` |
| `Reflector` real em teste de guard | `jest.spyOn(reflector, 'getAllAndOverride')` |
| Compartilhar estado entre testes | `cleanDatabase(prisma)` em `beforeEach` |
| `collectCoverageFrom: ["**/*"]` | excluir `*.module.ts`, `main.ts`, `tracing.ts` |

## Red Flags — pare e refatore

- Mock com mesmo nome do SUT → você está testando nada.
- Test que passa quando a implementação é removida → não tem assertiva real.
- Mais de 4-5 `mock.X.mockResolvedValue` em um teste → teste está grande demais, quebre.
- `expect(mockService.method).toHaveBeenCalled()` sem argumentos → tá só provando que foi chamado, não como.

## Reference

- Detalhes completos: [`.agent/docs/04-padroes-testes-nestjs.md`](../../docs/04-padroes-testes-nestjs.md)
- Estratégia: [`.agent/docs/01-estrategia-testes.md`](../../docs/01-estrategia-testes.md)
- Fonte canônica: [AGENTS.md §11](../../AGENTS.md#11-testing)
- Doc oficial: https://docs.nestjs.com/fundamentals/testing
