---
title: Padrões de Testes NestJS
description: Padrões idiomáticos para testar controllers, services, guards, interceptors, decorators, DTOs e repositories em NestJS 11
last_updated: 2026-06-15
reviewer: analista-qualidade
related:
  - 01-estrategia-testes.md
  - 03-tdd-atdd-na-stack.md
  - ../../AGENTS.md
---

# Padrões de Testes NestJS (Jest + Supertest)

> Guia de **receitas prontas** para os 8 tipos de unidade testáveis num projeto NestJS. Cada padrão tem um exemplo mínimo rodável e armadilhas comuns.

## Stack de teste deste projeto

| Ferramenta | Versão | Uso |
|------------|--------|-----|
| `jest` | ^30.2.0 | Runner + assertions |
| `ts-jest` | ^29.4.1 | Transform TS |
| `@nestjs/testing` | ^11.1.13 | `Test.createTestingModule` |
| `supertest` | ^7.1.4 | Cliente HTTP para e2e |
| `@types/supertest` | ^6.0.3 | Types |
| `@types/jest` | ^30.0.0 | Types |

## 1. Testando SERVICES (camada de aplicação)

**Padrão** (do `auth.service.spec.ts`):

```typescript
describe('UsuariosService', () => {
  let service: UsuariosService;
  const mockRepo = { findById: jest.fn(), save: jest.fn(), findAll: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: UsuarioRepository, useValue: mockRepo },
      ],
    }).compile();
    service = module.get(UsuariosService);
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('deve retornar o usuário quando existir', async () => {
      mockRepo.findById.mockResolvedValue(buildMockUsuario());
      const result = await service.findById(1);
      expect(result).toEqual(buildMockUsuario());
      expect(mockRepo.findById).toHaveBeenCalledWith(1);
    });

    it('deve lançar NotFoundException quando não existir', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });
});
```

**Regras**:

- ✅ Mock **apenas** o repository (dependência direta), não services vizinhos
- ✅ Use `jest.clearAllMocks()` em `afterEach` para evitar vazamento entre testes
- ✅ Crie um `buildMock*()` para entidades de teste (centraliza o fixture)
- ❌ Não teste implementação interna (`if` privado) — teste **retorno e side-effects**

## 2. Testando CONTROLLERS (unit, sem app)

```typescript
describe('UsuariosController', () => {
  let controller: UsuariosController;
  const mockService = { findAll: jest.fn(), findById: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsuariosController],
      providers: [{ provide: UsuariosService, useValue: mockService }],
    }).compile();
    controller = module.get(UsuariosController);
  });

  it('deve repassar x-empresa-id para o service', async () => {
    mockService.findAll.mockResolvedValue([]);
    await controller.findAll('empresa-uuid', { sub: 1 } as any);
    expect(mockService.findAll).toHaveBeenCalledWith('empresa-uuid', 1);
  });
});
```

**Regras**:

- ✅ Teste **pipes/decorators**: se o controller usa `@EmpresaId()`, `@UsuarioLogado()`, `@Body()`, verifique que **o decorator injeta** certo
- ✅ Teste **switches de comportamento**: `@Public()` vs protegida, `@TemPermissao()`
- ❌ Não teste guards/interceptors aqui — teste **separadamente** (eles são unidades independentes)

## 3. Testando GUARDS

```typescript
describe('PermissaoGuard', () => {
  let guard: PermissaoGuard;
  let reflector: Reflector;
  const mockAuthz = { can: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PermissaoGuard,
        Reflector,
        { provide: 'IAuthorizationService', useValue: mockAuthz },
      ],
    }).compile();
    guard = module.get(PermissaoGuard);
    reflector = module.get(Reflector);
  });

  const mockContext = (user: any, empresaId: string) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user, headers: { 'x-empresa-id': empresaId } }),
    }),
    getHandler: () => function () {},
    getClass: () => class {},
  }) as unknown as ExecutionContext;

  it('deve permitir quando usuário tem permissão', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['READ_USUARIOS']);
    mockAuthz.can.mockResolvedValue(true);
    await expect(guard.canActivate(mockContext({ id: 1 }, 'emp-1'))).resolves.toBe(true);
  });

  it('deve negar com ForbiddenException quando não tem permissão', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['READ_USUARIOS']);
    mockAuthz.can.mockResolvedValue(false);
    await expect(guard.canActivate(mockContext({ id: 1 }, 'emp-1'))).rejects.toThrow(ForbiddenException);
  });

  it('deve permitir sem verificar permissão se não há @TemPermissao', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    await expect(guard.canActivate(mockContext({ id: 1 }, 'emp-1'))).resolves.toBe(true);
    expect(mockAuthz.can).not.toHaveBeenCalled();
  });
});
```

**Regras**:

- ✅ Mocke `Reflector.getAllAndOverride()` com `jest.spyOn`
- ✅ Sempre teste o **caminho sem metadata** (recurso "neutro")
- ✅ Teste cada combinação: com permissão / sem / token ausente

## 4. Testando INTERCEPTORS

```typescript
describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  const mockLogger = { log: jest.fn() };

  beforeEach(() => {
    interceptor = new LoggingInterceptor(mockLogger as any);
  });

  it('deve logar método, URL, status e latência', (done) => {
    const next = of({ statusCode: 200 });
    const mockReq = { method: 'GET', url: '/usuarios' };
    const mockContext = {
      switchToHttp: () => ({ getRequest: () => mockReq }),
    } as unknown as ExecutionContext;

    interceptor.intercept(mockContext, { handle: () => next } as any).subscribe({
      complete: () => {
        expect(mockLogger.log).toHaveBeenCalledWith(expect.stringMatching(/GET.*\/usuarios.*200/));
        done();
      },
    });
  });
});
```

**Regras**:

- ✅ Use `of()` (rxjs) para mockar o `next.handle()`
- ✅ Espie o **efeito observável** (log, header HTTP, transformação)
- ❌ Não teste a implementação interna de rxjs

## 5. Testando DECORATORS customizados

```typescript
import { Reflector } from '@nestjs/core';

describe('@Public', () => {
  it('deve emitir metadata isPublic=true', () => {
    @Public()
    class TestClass {}

    const reflector = new Reflector();
    expect(reflector.get('isPublic', TestClass)).toBe(true);
  });
});
```

**Para `@TemPermissao('A', 'B')`** (parâmetros):

```typescript
it('deve emitir metadata com array de permissões', () => {
  @TemPermissao('READ_USUARIOS', 'UPDATE_USUARIOS')
  class TestClass {}

  const reflector = new Reflector();
  expect(reflector.get('temPermissao', TestClass)).toEqual(['READ_USUARIOS', 'UPDATE_USUARIOS']);
});
```

## 6. Testando DTOs com class-validator

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUsuarioDto } from './create-usuario.dto';

describe('CreateUsuarioDto', () => {
  const validateDto = async (data: any) => {
    const dto = plainToInstance(CreateUsuarioDto, data);
    const errors = await validate(dto);
    return errors.map(e => ({
      property: e.property,
      constraints: e.constraints,
    }));
  };

  it('deve aceitar payload válido', async () => {
    const errors = await validateDto({ email: 'a@b.com', senha: 'Password123!' });
    expect(errors).toHaveLength(0);
  });

  it('deve rejeitar email inválido', async () => {
    const errors = await validateDto({ email: 'invalido', senha: 'Password123!' });
    expect(errors[0].property).toBe('email');
    expect(errors[0].constraints).toHaveProperty('isEmail');
  });

  it('deve rejeitar senha com menos de 8 caracteres', async () => {
    const errors = await validateDto({ email: 'a@b.com', senha: 'curta' });
    expect(errors[0].property).toBe('senha');
    expect(errors[0].constraints).toHaveProperty('minLength');
  });
});
```

**Cobrir por DTO** (regra de projeto):

- [ ] Payload válido (zero erros)
- [ ] Cada `@IsXxx` (1 teste por constraint)
- [ ] Cada `@MinLength`/`@MaxLength` (boundary: n-1, n, n+1)
- [ ] Campo obrigatório faltando
- [ ] Whitespace/empty string

## 7. Testando PIPES

```typescript
describe('ParseIntPipe', () => {
  let pipe: ParseIntPipe;

  beforeEach(() => { pipe = new ParseIntPipe(); });

  it('deve converter string numérica', () => {
    expect(pipe.transform('42', { type: 'param', data: 'id' } as any)).toBe(42);
  });

  it('deve lançar BadRequestException para NaN', () => {
    expect(() => pipe.transform('abc', { type: 'param', data: 'id' } as any))
      .toThrow(BadRequestException);
  });
});
```

## 8. Testando ESTRATÉGIAS (Passport)

```typescript
describe('JwtStrategy', () => {
  const strategy = new JwtStrategy(
    { getOrThrow: () => 'secret' } as any,
    { findByIdWithPerfis: jest.fn() } as any,
  );

  it('deve retornar payload normalizado', async () => {
    const mockUser = { id: 1, email: 'a@b.com', empresas: [] };
    (strategy as any).userRepo = { findByIdWithPerfis: jest.fn().mockResolvedValue(mockUser) };
    const result = await strategy.validate({ sub: 1, email: 'a@b.com' });
    expect(result).toEqual(expect.objectContaining({ id: 1 }));
  });

  it('deve lançar UnauthorizedException se usuário não existe', async () => {
    (strategy as any).userRepo = { findByIdWithPerfis: jest.fn().mockResolvedValue(null) };
    await expect(strategy.validate({ sub: 999 })).rejects.toThrow(UnauthorizedException);
  });
});
```

## 9. Testando REPOSITORIES Prisma (com DB real ou in-memory)

### Opção A — E2E com Prisma real

```typescript
// já existe helper em test/e2e-utils.ts
beforeEach(async () => { await cleanDatabase(prisma); });

it('deve filtrar soft-deleted automaticamente', async () => {
  await prisma.usuario.create({ data: { email: 'a@b.com', senha: 'x' } });
  await prisma.usuario.updateMany({ data: { deletedAt: new Date() } });

  const repo = new PrismaUsuarioRepository(prisma);
  const result = await repo.findAll();
  expect(result).toHaveLength(0);
});
```

### Opção B — Unit com `mockDeep` do `prisma-client-js`

```typescript
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

describe('PrismaUsuarioRepository', () => {
  let prisma: DeepMockProxy<PrismaClient>;
  let repo: PrismaUsuarioRepository;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    repo = new PrismaUsuarioRepository(prisma);
  });

  it('deve chamar prisma.user.findUnique com id', async () => {
    prisma.user.findUnique.mockResolvedValue(buildMockUser() as any);
    await repo.findById(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
  });
});
```

> **Recomendação deste projeto**: Opção A (com DB real + `cleanDatabase`) — testa **comportamento real** do `prisma-extension` (soft-delete auto-filter). Opção B é mais rápida mas esconde bugs do extension.

## 10. Testando E2E (HTTP ponta a ponta)

```typescript
// test/auth.e2e-spec.ts (padrão do projeto)
let app: NestFastifyApplication;
let prisma: PrismaService;
let jwtService: JwtService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  prisma = app.get(PrismaService);
  jwtService = app.get(JwtService);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => { await app.close(); });
beforeEach(async () => { await cleanDatabase(prisma); });

it('login com credenciais válidas', async () => {
  await request(app.getHttpServer()).post('/usuarios').send({ email: 'a@b.com', senha: 'Password123!' }).expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: 'a@b.com', senha: 'Password123!' })
    .expect(201);
  expect(res.body).toHaveProperty('access_token');
});
```

**Regras**:

- ✅ `maxWorkers: 1` (já configurado em `test/jest-e2e.json`) — serializa para evitar race
- ✅ `cleanDatabase` em `beforeEach` (não `beforeAll`) — testes isolados
- ✅ Use `supertest(app.getHttpServer())` (não `supertest(url)`) — mais rápido
- ❌ Não compartilhe estado entre testes via variáveis de módulo

## 11. Coverage Patterns

```typescript
// jest.config.ts (já em package.json)
"collectCoverageFrom": ["**/*.(t|j)s"]
```

> **Limitação**: o array `collectCoverageFrom` atual é abrangente demais. **Recomendação** (registrar como follow-up):

```json
"collectCoverageFrom": [
  "src/**/*.ts",
  "!src/**/*.module.ts",
  "!src/**/main.ts",
  "!src/**/tracing.ts",
  "!src/**/migrations/**",
  "!src/**/*.d.ts"
]
```

## 12. Resumo — quando usar cada padrão

| Unidade | Tipo de teste | Onde |
|---------|---------------|------|
| Service | Unit (com mock de repo) | `*.service.spec.ts` |
| Controller | Unit (com mock de service) | `*.controller.spec.ts` |
| Guard | Unit (Reflector mock) | `*.guard.spec.ts` |
| Interceptor | Unit (next.handle mock) | `*.interceptor.spec.ts` |
| Decorator | Unit (Reflector.get) | `*.decorator.spec.ts` |
| DTO | Unit (validate) | `*.dto.spec.ts` |
| Pipe | Unit (transform) | `*.pipe.spec.ts` |
| Strategy | Unit (validate) | `*.strategy.spec.ts` |
| Repository | E2E (DB real) | `test/*.e2e-spec.ts` ou `*.repository.spec.ts` com DB |
| Fluxo HTTP | E2E (Supertest) | `test/*.e2e-spec.ts` |

## 13. Referências

- [NestJS Testing — docs oficiais](https://docs.nestjs.com/fundamentals/testing)
- [`.agent/docs/03-tdd-atdd-na-stack.md`](./03-tdd-atdd-na-stack.md)
- [`.agent/docs/01-estrategia-testes.md`](./01-estrategia-testes.md)
