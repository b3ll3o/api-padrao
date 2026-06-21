---
name: hexagonal-ports-nestjs
description: Use when designing module boundaries, extracting domain interfaces, or auditing whether the application layer depends on infrastructure details — applies to enforce Ports & Adapters so the domain stays free of @nestjs/* and @prisma/* imports.
last_updated: 2026-06-15
reviewer: analista-backend
---

# Hexagonal (Ports & Adapters) aplicado ao NestJS

Como aplicar **Ports & Adapters** (Alistair Cockburn) no NestJS 11 do
projeto `api-padrao`. Use quando for **definir a fronteira de um módulo**,
**extrair uma porta nova**, ou **auditar** se a camada de aplicação
está vazando para a infra.

## When to Use

Sintomas: "esse service injeta `PrismaService` direto", "como eu mocko o
banco no teste?", "trocar Prisma por TypeORM custa caro", "o que é
`PasswordHasher`?", "domain pode importar `@prisma/client`?".

**Não** use para: modelagem de domínio (use `ddd-aggregate-modeling`),
padrões de código limpo (use `clean-code-solid-typescript`), tuning de
Prisma (use `prisma-query-optimization`).

## Regra de ouro

```text
DOMAIN  → não importa NADA de @nestjs/*, @prisma/*, axios, bcrypt, etc.
APP     → depende de DOMAIN + portas (interfaces)
INFRA   → depende de DOMAIN + APP + implementa as portas
```

**Teste de sanidade** (rodar na varredura):

```bash
grep -RE "from '@nestjs|@prisma|@fastify'" src/<m>/domain/
# Esperado: 0 hits
```

## 1. As 3 camadas

```text
                         ┌──────────────────────────────────────┐
                         │       INFRA (Adapters)              │
                         │  Prisma Repos, JWT, Fastify, Redis,  │
                         │  BullMQ, Email, etc.                 │
                         └────────────┬─────────────────────────┘
                                      │ implementa
                                      ▼
                         ┌──────────────────────────────────────┐
                         │     APPLICATION (Use Cases)          │
                         │  Services, controllers, DTOs         │
                         └────────────┬─────────────────────────┘
                                      │ depende
                                      ▼
                         ┌──────────────────────────────────────┐
                         │          DOMAIN (puro)               │
                         │  Entities, VOs, Repos (interface),   │
                         │  Domain Services, Domain Events      │
                         └──────────────────────────────────────┘
```

| Camada | Pode importar | NÃO pode importar |
|--------|---------------|-------------------|
| **Domain** | TS puro, outras classes do mesmo `domain/`, libs puras | `@nestjs/*`, `@prisma/*`, `class-validator`, `axios`, `bcrypt`, qualquer I/O |
| **Application** | `domain/`, DTOs (em `dto/`), `class-validator` | `prisma` diretamente |
| **Infra** | Tudo (Nest, Prisma, Fastify, Redis) | — (é a borda externa) |

## 2. Port (interface) vs Adapter (implementação)

| Conceito | Forma no projeto | Onde mora |
|----------|------------------|-----------|
| **Port (porta)** | `abstract class` ou `interface` + token de DI | `src/<m>/domain/repositories/*.repository.ts` |
| **Adapter (impl)** | Classe concreta `@Injectable()` | `src/<m>/infrastructure/repositories/Prisma*Repository.ts` |
| **Token de DI** | `Symbol` ou string | junto com a interface |
| **Wiring** | `useClass: ImplConcreta` no `<m>.module.ts` | `src/<m>/<m>.module.ts` |

### Exemplo completo: `RefreshTokenRepository`

```typescript
// 1. PORTA (no domain)
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

export interface RefreshTokenRepository {
  create(data: {
    token: string;
    userId: number;
    expiresAt: Date;
  }): Promise<RefreshToken>;

  findByToken(token: string): Promise<RefreshToken | null>;

  revoke(id: string): Promise<void>;

  revokeAllForUser(userId: number): Promise<void>;
}

// 2. ADAPTER (no infra)
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { token: string; userId: number; expiresAt: Date }) {
    return this.prisma.refreshToken.create({ data });
  }

  async findByToken(token: string) {
    return this.prisma.refreshToken.findUnique({ where: { token } });
  }

  async revoke(id: string) {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: number) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

// 3. WIRING (no module)
@Module({
  providers: [
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: PrismaRefreshTokenRepository,
    },
    // ... outros providers
  ],
})
export class AuthModule {}
```

### Uso no service (Application)

```typescript
@Injectable()
export class AuthService {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: RefreshTokenRepository, // ← porta
    // ... outros (NUNCA PrismaService)
  ) {}

  async login(dto: LoginUsuarioDto) {
    // ...
    await this.refreshTokenRepo.create({
      token: refreshTokenValue,
      userId: user.id,
      expiresAt,
    });
  }
}
```

## 3. Portas que o projeto já tem (e o que falta)

| Porta | Status | Onde |
|-------|--------|------|
| `PasswordHasher` | ✓ | `src/shared/domain/services/password-hasher.service.ts` |
| `UsuarioRepository` | ✓ | `src/usuarios/domain/repositories/usuario.repository.ts` |
| `EmpresaRepository` | ✓ | `src/empresas/domain/repositories/empresa.repository.ts` |
| `PerfilRepository` | ✓ | `src/perfis/domain/repositories/perfil.repository.ts` |
| `PermissaoRepository` | ✓ | `src/permissoes/domain/repositories/permissao.repository.ts` |
| `RefreshTokenRepository` | ✗ **gap** | `auth/service.ts` usa `this.prisma.refreshToken` direto |
| `LoginHistoryRepository` | ✗ **gap** | `auth/service.ts` usa `this.prisma.loginHistory` direto |
| `Clock` (now) | ✗ **gap** | `new Date()` espalhado |
| `CacheService` | ✗ **gap** | uso direto do `CACHE_MANAGER` |
| `Mailer` | ✗ **gap** | se/ quando houver envio de e-mail |
| `TokenIssuer` | ✗ **gap** | `auth.service.generateTokens` mistura JWT + DB |

## 4. Quando criar uma porta

> *"Toda vez que o `application/` precisar falar com o 'mundo externo',
> crie uma porta."*

| Mundo externo | Porta |
|---------------|-------|
| Banco de dados | `XxxRepository` |
| Cache | `CacheService` |
| Fila | `Queue<T>` (interface, não a classe BullMQ) |
| Hash de senha | `PasswordHasher` |
| Relógio | `Clock` |
| E-mail | `Mailer` |
| HTTP externo | `HttpClient` (wrapper do axios) |
| JWT / token | `TokenIssuer`, `TokenVerifier` |
| Eventos | `EventBus` (interface, não `EventEmitter2` direto) |

**Regra prática**: se você precisa **mockar** em teste, precisa de porta.

## 5. Erros comuns

| ❌ Errado | ✅ Correto |
|----------|-----------|
| Interface no `infrastructure/` | Interface no `domain/` |
| Service injeta `PrismaService` | Service injeta **porta** |
| Controller com regra de negócio | Controller só traduz HTTP ↔ DTO |
| Mockar `PrismaService` em todo teste | Mockar **portas** (repositórios) |
| Domain importa `class-validator` | Validação no DTO (camada `dto/`) |
| Domain importa `@prisma/client` | Mover tipos para `infrastructure/mappers/` |
| `if (cache) { await cache.set(...) }` no service | `CacheService` com fallback interno |
| `new Date()` no service | Injetar `Clock.now()` |

## 6. Domain puro — imports proibidos

```typescript
// src/<m>/domain/ — PROIBIDO

import { Injectable, BadRequestException } from '@nestjs/common'; // ❌ framework
import { PrismaClient } from '@prisma/client';                    // ❌ ORM
import { IsEmail, IsString } from 'class-validator';              // ❌ validação HTTP
import axios from 'axios';                                        // ❌ I/O externo
import * as bcrypt from 'bcrypt';                                 // ❌ I/O
import { PinoLogger } from 'nestjs-pino';                         // ❌ logging
import { Cache } from 'cache-manager';                            // ❌ cache
```

**Substituir por**:

```typescript
// Domain usa APENAS TypeScript puro
import { DomainError } from '../../../shared/domain/errors/domain-error';
import { Email } from '../../../shared/domain/vos/email.vo';
// (sem imports de framework)
```

## 7. Mapeamento para o workflow

| Fase | Saída | Artefato |
|------|-------|----------|
| **DDD (Plan)** | Identificar portas | `domain/repositories/*.repository.ts` (esqueleto) |
| **BDD (Plan)** | Use cases em Gherkin | `features/<m>.feature` |
| **SDD (Plan)** | REQ referenciando portas | `.openspec/.../design.md` |
| **TDD (Build)** | Testes do service mockando portas | `*.service.spec.ts` |
| **Implementação (Build)** | Adapter concreto | `infrastructure/repositories/Prisma*Repository.ts` |
| **Wiring (Build)** | `useClass: Impl` no module | `<m>.module.ts` |

## 8. Auditoria Hexagonal (checklist)

```text
[ ] grep -RE "from '@nestjs" src/<m>/domain/  → 0 hits
[ ] grep -RE "from '@prisma" src/<m>/domain/   → 0 hits
[ ] grep -RE "this\.prisma\." src/<m>/application/  → 0 hits
[ ] Toda interface em domain/ é implementada em infrastructure/
[ ] <m>.module.ts tem useClass para todas as portas
[ ] Testes do service mockam portas (não PrismaService)
[ ] Trocar bcrypt por argon2 toca 1 arquivo (o adapter)
[ ] Trocar Prisma por TypeORM toca 1 arquivo por entidade
```

## 9. Adoção incremental

| Passo | Esforço | Valor |
|-------|---------|-------|
| 1. Criar `RefreshTokenRepository` (porta + adapter) | 1h | Service testável sem DB |
| 2. Criar `LoginHistoryRepository` | 30min | Idem |
| 3. Criar `Clock` (injetado em vez de `new Date()`) | 1h | Testes determinísticos |
| 4. Criar `CacheService` (wrapper do `CACHE_MANAGER`) | 2h | Cache strategy uniforme |
| 5. Criar `Mailer` (preparar para envio de e-mail) | 1h | Pronto para uso |
| 6. Criar `TokenIssuer` (separa JWT do service) | 2h | Trocar algoritmo de JWT = 1 arquivo |
| 7. Refatorar `AuthService` para usar todas as portas | 2h | Service puro, sem `prisma.*` |

## 10. Reference

- [`.agent/docs/06-arquitetura-hexagonal-nestjs.md`](../../docs/06-arquitetura-hexagonal-nestjs.md) — Hexagonal completo
- [`.agent/skills/ddd-aggregate-modeling/SKILL.md`](../ddd-aggregate-modeling/SKILL.md) — DDD
- [`.agent/skills/clean-code-solid-typescript/SKILL.md`](../clean-code-solid-typescript/SKILL.md) — SOLID (DIP é Hexagonal)
- [`.agent/skills/prisma-query-optimization/SKILL.md`](../prisma-query-optimization/SKILL.md) — onde mora o Prisma
- [`.agent/skills/clean-code-solid-typescript/SKILL.md`](../clean-code-solid-typescript/SKILL.md) — testes com mocks de portas
- Alistair Cockburn — *Hexagonal Architecture* (2005) — referência original
- Vaughn Vernon — *Implementing Domain-Driven Design* (2013) — Hexagonal na prática
