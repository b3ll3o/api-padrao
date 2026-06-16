---
title: Arquitetura Hexagonal (Ports & Adapters) aplicada ao NestJS
description: Conceitos de Ports & Adapters, diferença para Clean/Onion, mapeamento para NestJS
last_updated: 2026-06-15
reviewer: analista-backend
related:
  - 05-ddd-aplicado-nestjs.md
  - 07-clean-code-solid-typescript.md
  - ../../AGENTS.md
---

# Arquitetura Hexagonal (Ports & Adapters) aplicada ao NestJS

> Documento de referência sobre Arquitetura Hexagonal (Alistair Cockburn, 2005),
> também conhecida como **Ports & Adapters** ou **Boundary-Control-Entity**.
> Foco: como o **domínio fica isolado** da infraestrutura, com **inversão de
> dependência** explícita, e como isso se aplica ao projeto `api-padrao`.

## 1. O que é Hexagonal (essência)

O problema que Hexagonal resolve:

> Quando o domínio conversa **diretamente** com o banco, o framework HTTP, o
> serviço de e-mail, etc., mudar qualquer um deles **custa caro**, e o domínio
> fica **contaminado** por detalhes técnicos.

A solução:

> O **domínio** define **portas** (interfaces) — o que ele precisa. A
> **infraestrutura** implementa essas portas — como ela entrega.

**Princípio central**: a **regra de dependência** aponta **para dentro** —
`infra → application → domain`. O **domínio não conhece** o banco, o HTTP,
o framework. Ele é puro TypeScript (sem `@nestjs/common`, sem `@prisma/client`).

## 2. Anatomia: 3 camadas + 2 tipos de borda

```text
                         ┌──────────────────────────────────────┐
                         │       INFRA (Adapters)              │
                         │  Prisma Repos, JWT, Fastify, Redis,  │
                         │  BullMQ, Email, OTP, etc.            │
                         └────────────┬─────────────────────────┘
                                      │ implementa
                                      ▼
                         ┌──────────────────────────────────────┐
                         │     APPLICATION (Use Cases)          │
                         │  Services, controllers, DTOs, mappers│
                         └────────────┬─────────────────────────┘
                                      │ depende
                                      ▼
                         ┌──────────────────────────────────────┐
                         │          DOMAIN                      │
                         │  Entities, VOs, Aggregates, Events,  │
                         │  Repositories (interfaces), Services │
                         └──────────────────────────────────────┘
```

| Camada | Depende de | Conhece |
|--------|-----------|---------|
| **Domain** | Nada (zero imports de `@nestjs/*` ou `@prisma/*`) | Só TypeScript puro |
| **Application** | Domain | Domain + contratos (interfaces) |
| **Infra** | Domain, Application | Tudo (NestJS, Prisma, Fastify) |

## 3. Ports & Adapters: os termos

| Termo | O que é | No NestJS |
|-------|---------|-----------|
| **Port (Porta)** | Interface no domínio que declara uma necessidade | `interface UsuarioRepository`, `interface PasswordHasher`, `interface Clock`, `interface Mailer` |
| **Adapter (Adaptador)** | Implementação concreta da porta | `PrismaUsuarioRepository`, `BcryptPasswordHasherService`, `SystemClock`, `SmtpMailer` |
| **Driving Adapter** | Quem **chama** a aplicação (HTTP, CLI, fila) | `AuthController`, `@MessagePattern('criar-x')` |
| **Driven Adapter** | Quem a aplicação **chama** (DB, e-mail, cache) | `PrismaUsuarioRepository`, `RedisCacheService` |

O framework (Nest) é um **driving adapter** (HTTP). Trocar de HTTP pra
GraphQL, gRPC, CLI ou fila **não muda o domínio**.

## 4. Mapeamento direto para o projeto

O `AGENTS.md §4` já define a estrutura. Veja como ela casa com Hexagonal:

```text
src/<módulo>/
├── domain/                ← camada DOMAIN (puro, sem Nest/Prisma)
│   ├── entities/          ← Entidades, Aggregates, VOs
│   ├── repositories/      ← Ports (interfaces) ←── adapters implementam
│   ├── services/          ← Domain services (interfaces)
│   └── events/            ← Domain Events
├── application/           ← camada APPLICATION (orquestra casos de uso)
│   ├── controllers/       ← Driving adapter (Nest controller)
│   └── services/          ← Use cases (Application Services)
├── infrastructure/        ← camada INFRA (driven adapters)
│   ├── repositories/      ← Prisma<Modulo>Repository (implementa Port)
│   └── services/          ← outras integrações
├── dto/                   ← DTOs (fronteira HTTP)
└── <modulo>.module.ts     ← DI wiring (Nest module)
```

### Exemplo concreto: `auth.service.ts`

```typescript
// src/auth/application/services/auth.service.ts (Application layer)
// Depende de:
//   - UsuarioRepository (porta do domain) → PrismaUsuarioRepository (infra)
//   - PasswordHasher (porta do domain) → BcryptPasswordHasherService (infra)
//   - JwtService (do Nest, mas usado como ferramenta — não é domain)
//   - PrismaService (infra direta — gap a tratar)
```

**Gap atual**: o `AuthService` chama `this.prisma.refreshToken.create(...)`
**diretamente**. Isso é uma violação de Hexagonal — a Application depende
de um detalhe de infra. O correto:

```typescript
// domain/repositories/refresh-token.repository.ts (porta)
export interface RefreshTokenRepository {
  create(data: { token: string; userId: number; expiresAt: Date }): Promise<RefreshToken>;
  findByToken(token: string): Promise<RefreshToken | null>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: number): Promise<void>;
}

// infrastructure/repositories/prisma-refresh-token.repository.ts (adapter)
@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository { ... }

// application/services/auth.service.ts
constructor(
  private readonly refreshTokenRepo: RefreshTokenRepository, // ← porta
) {}
```

**Benefício**: o service fica testável **sem** mockar o `PrismaService`,
e trocar Prisma por outro ORM não exige tocar no service.

### Outros exemplos do mesmo gap a corrigir

| Onde | Hoje | Correto (Hexagonal) |
|------|------|---------------------|
| `AuthService.login()` | `this.prisma.loginHistory.create(...)` | `LoginHistoryRepository.create(...)` |
| `AuthService.refreshTokens()` | `this.prisma.refreshToken.{findUnique,update,updateMany}(...)` | `RefreshTokenRepository.{findByToken,revoke,revokeAllForUser}(...)` |
| `UsuariosService` (provável) | qualquer `this.prisma.X` | sempre via repositório |

## 5. Domain puro: regras de import

A camada `domain/` **não pode** importar:

| Proibido | Por quê |
|----------|---------|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/*` | Framework HTTP, não é regra de negócio |
| `@prisma/client` | Schema do banco, vazaria modelo |
| `class-validator`, `class-transformer` | Validação de DTO (entrada HTTP) |
| `axios`, `bcrypt`, `crypto` | Detalhes de integração |
| `pino`, `winston`, `console.log` | Logging de infra |

A camada `domain/` **só pode** importar:

- TypeScript puro (`type`, `interface`, classes, etc.)
- Outras classes/interfaces do **próprio** `domain/` do mesmo módulo
- Bibliotecas puras (ex.: `uuid` se necessário para gerar IDs em factory)
- `class-validator` pode aparecer se o VO **validar** (alternativa: usar `zod` puro)

**Como verificar**: rode `grep -RE "from '@nestjs|@prisma' src/<m>/domain/"`.
**Esperado**: zero hits.

## 6. Application: orquestra, não decide

A camada `application/` tem **dois tipos** de classes:

### 6.1 Controllers (driving adapter)

- Traduzem HTTP → chamada de service.
- Lidam com `ValidationPipe` (DTO), status code, headers, `@HttpCode`, etc.
- **Nunca** acessam o banco, **nunca** validam regra de negócio.
- **Nunca** injetam `PrismaService` diretamente.

### 6.2 Application Services (Use Cases)

- Orquestram: "dado X, chamar método A, depois B, depois C".
- **Não** decidem regra — chamam a entidade/VO/domínio.
- Têm **uma responsabilidade por método** (SRP). Evite service "Deus".

```typescript
// application/services/auth.service.ts (correto, refatorado)
async login(dto: LoginUsuarioDto) {
  const user = await this.userRepo.findByEmailWithPerfis(dto.email);
  if (!user) throw new UnauthorizedException('Credenciais inválidas');

  const senhaValida = await this.passwordHasher.compare(dto.senha, user.senhaHash);
  if (!senhaValida) throw new UnauthorizedException('Credenciais inválidas');

  await this.loginHistoryRepo.record(user.id, /* ip, ua */);

  return this.tokenIssuer.issueFor(user);
}
```

## 7. Infra: implementa as portas, isolando o "mundo externo"

A camada `infrastructure/` é onde o Nest, o Prisma, o Redis, o BullMQ, o
Helmet, o OpenTelemetry **vivem**. Exemplos de adaptadores no projeto:

| Adaptador | Porta que implementa | Detalhe |
|-----------|---------------------|---------|
| `PrismaUsuarioRepository` | `UsuarioRepository` | CRUD de `Usuario` |
| `BcryptPasswordHasherService` | `PasswordHasher` | Hash/compare de senha |
| `JwtTokenIssuer` (a criar) | `TokenIssuer` | Emite access/refresh |
| `PrismaRefreshTokenRepository` (a criar) | `RefreshTokenRepository` | Persistência de refresh tokens |
| `RedisCacheService` (a criar) | `CacheService` | Wrapper de cache-manager |
| `SystemClock` (a criar) | `Clock` | `now()` — facilita testes |

**Princípio**: se amanhã trocarmos o Prisma por TypeORM, ou o bcrypt por
argon2, ou o Redis por Memcached, **só o adapter muda**. O domínio e os
use cases ficam intactos.

## 8. Módulo do Nest: o "DI Container" do contexto

O `<modulo>.module.ts` é onde a **injeção de dependência** conecta portas a
adaptadores. É a "cola" entre camadas:

```typescript
// src/auth/auth.module.ts
@Module({
  imports: [UsuariosModule, /* PrismaModule removido — acesso via repo */],
  controllers: [AuthController],
  providers: [
    AuthService,
    // ↓ Adaptadores concretos
    { provide: PasswordHasher, useClass: BcryptPasswordHasherService },
    { provide: TokenIssuer, useClass: JwtTokenIssuer },
    // ↑ Portas declaradas no domain
  ],
})
export class AuthModule {}
```

**Por que isso importa**: o `<modulo>.module.ts` é o **único lugar** onde
o domínio "enxerga" o Nest. Trocar a injeção (ex.: usar um
`InMemoryUsuarioRepository` em testes) é mudar o `module.ts` (ou o
`Test.createTestingModule`).

## 9. Hexagonal ≠ Clean ≠ Onion (comparação honesta)

| Aspecto | Hexagonal | Clean Architecture | Onion |
|---------|-----------|--------------------|-------|
| Camadas | 3 (domínio, app, infra) | 4 (entities, use cases, interface adapters, frameworks) | 4 (domínio, app, infra, UI) |
| Foco | Portas & adaptadores | Regra de dependência | Camadas concêntricas |
| Autores | Alistair Cockburn (2005) | Robert C. Martin (2012) | Jeffrey Palermo (2008) |
| Origem | Ports & Adapters | Uncle Bob | Onion Architecture |
| Na prática | **São quase a mesma coisa** | com mais ênfase em "entities" | com UI destacada |

**No projeto**: usamos o termo **Clean Architecture** no `AGENTS.md`, mas
**aplicamos Hexagonal** (portas explícitas no `domain/repositories/`).
Não há conflito — são equivalentes para nossos fins.

## 10. Anti-padrões Hexagonal a vigiar

| ❌ Anti | ✅ Correto |
|---------|-----------|
| `domain/entities/usuario.entity.ts` importa `@prisma/client` | Mover `Prisma.UsuarioWhereInput` para `infrastructure/mappers/usuario.mapper.ts` |
| Service injeta `PrismaService` | Service injeta **porta** (`UsuarioRepository`) |
| Interface no `infrastructure/` | Interface sempre no `domain/` |
| Lógica de negócio no controller (ex.: calcular idade) | Lógica no **domínio**; controller só converte HTTP ↔ DTO |
| Camada "service" do Nest virou "Deus" | Separar por caso de uso; serviços magros |
| Repository retornando `Prisma.UsuarioGetPayload<...>` | Retornar entidade de domínio; mapeamento no adapter |
| Mocks do `PrismaService` em todo teste | Mocks das **portas** (repositórios) — testes do service são rápidos e puros |

## 11. Checklist Hexagonal (use ao auditar um módulo)

```text
[ ] src/<m>/domain/ não importa nada de @nestjs/* ou @prisma/*
[ ] Toda "ferramenta externa" (DB, hash, email, cache) é uma interface no domain/
[ ] Toda interface do domain/ é implementada em src/<m>/infrastructure/
[ ] Services NUNCA importam PrismaService diretamente
[ ] Controllers NUNCA têm regra de negócio
[ ] Entidades têm comportamento (não são DTOs)
[ ] Mappers Prisma → Domain estão em infrastructure/ (nunca no domain/)
[ ] O <m>.module.ts é o único lugar que conhece a implementação concreta
[ ] Testes do service mockam as PORTAS (não PrismaService)
[ ] Trocar uma implementação concreta (ex.: bcrypt → argon2) toca 1 arquivo
```

## 12. Adoção incremental (não quebre o que funciona)

O projeto já está **bem encaminhado**. Para endurecer sem reescrever:

1. **Curto prazo (1-2 PRs)**: criar as portas que faltam
   - `RefreshTokenRepository` (no `auth/domain/`)
   - `LoginHistoryRepository` (no `auth/domain/` ou `usuarios/domain/`)
   - `Clock` (no `shared/domain/`)
   - `CacheService` (no `shared/domain/`)
2. **Médio prazo**: migrar o `AuthService` para usar as portas
3. **Médio prazo**: criar `domain/entities/<x>.entity.spec.ts` com testes de
   invariantes (TDD das entidades, hoje pouco explorado)
4. **Longo prazo**: emitir **Domain Events** a partir das raízes de agregado

**Não** reescreva tudo de uma vez. Hexagonal é um **continuum**: cada porta
extraída é um passo a mais de proteção do domínio.

## 13. Referências

- Alistair Cockburn — *Hexagonal Architecture* (2005, alistair.cockburn.us)
- Robert C. Martin — *Clean Architecture* (2012) — base teórica
- Vaughn Vernon — *Implementing Domain-Driven Design* (2013) — Hexagonal na prática
- Herberto Graça — *Architecture Patterns with Python* (2020) — cosmorama atual
- Microsoft — *.NET Microservices: Architecture for Containerized .NET Applications* (cap. sobre DDD/Hex)
- [`.agent/docs/05-ddd-aplicado-nestjs.md`](./05-ddd-aplicado-nestjs.md) — DDD complementa
- [`.agent/docs/07-clean-code-solid-typescript.md`](./07-clean-code-solid-typescript.md) — SOLID na implementação
- [AGENTS.md §4 — Arquitetura](../../AGENTS.md#4-arquitetura) — estrutura canônica
