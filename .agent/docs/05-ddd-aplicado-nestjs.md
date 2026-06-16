---
title: Domain-Driven Design aplicado ao NestJS
description: Conceitos de DDD, blocos táticos e como aplicá-los no projeto api-padrao
last_updated: 2026-06-15
reviewer: analista-backend
related:
  - 06-arquitetura-hexagonal-nestjs.md
  - 07-clean-code-solid-typescript.md
  - ../../AGENTS.md
---

# DDD aplicado ao NestJS (Domain-Driven Design)

> Documento de referência sobre Domain-Driven Design (Eric Evans, 2003; Vaughn Vernon,
> 2013) focado em como os blocos táticos e estratégicos se aplicam **neste projeto**.
> Complementa o `AGENTS.md §4` (que define a estrutura de pastas por módulo) e o
> `AGENTS.md §6` (workflow DDD→BDD→SDD→ATDD→TDD).

## 1. O que é DDD (essência)

DDD é uma disciplina de **modelagem de software** que coloca o **domínio de negócio**
como o centro do design. Dois pilares:

1. **Linguagem Ubíqua** (*Ubiquitous Language*) — devs e stakeholders usam **os mesmos
   termos** ("empresa", "perfil", "permissão", "responsável") no código, nos testes,
   nos documentos e nas conversas. Sem sinônimos.
2. **Contexto Delimitado** (*Bounded Context*) — cada parte do sistema que fala uma
   linguagem ubíqua **distinta** é um contexto. Contextos se comunicam por contratos
   explícitos (eventos, APIs, ACL).

DDD **não** é uma arquitetura de software — é uma abordagem de modelagem. As decisões
arquiteturais (Clean, Hexagonal, Onion) são **meios** para proteger o modelo de
domínio do acoplamento com infra.

## 2. Blocos Táticos (que importam aqui)

| Bloco | O que é | Como aparece no projeto |
|-------|---------|------------------------|
| **Entidade** | Objeto com identidade (id) que muda ao longo do tempo | `src/<modulo>/domain/entities/*.entity.ts` (ex.: `Usuario`, `Empresa`, `Perfil`) |
| **Value Object (VO)** | Objeto **sem** identidade, definido pelos seus valores. Imutável. | Endereço, e-mail, Money, Período — ainda pouco explorado (gap) |
| **Agregado** | Cluster de entidades + VOs com **uma raiz** (Aggregate Root) que controla invariantes | `Usuario` (raiz) ↔ `UsuarioEmpresa` ↔ `Perfil` — precisa explicitar |
| **Repositório** | Abstração para carregar/salvar **agregados** (não entidades quaisquer) | `src/<modulo>/domain/repositories/*.repository.ts` (interface) + `infrastructure/repositories/Prisma*Repository` |
| **Domain Service** | Lógica de domínio que **não cabe** em uma entidade específica | `src/shared/domain/services/password-hasher.service.ts` |
| **Application Service** | Orquestra casos de uso; **magro**, sem regra de domínio | `src/<modulo>/application/services/*.service.ts` |
| **Domain Event** | Fato que aconteceu no domínio, emitido pela raiz do agregado | `Usuario.criado`, `Token.revogado` — **gap**: não emitido ainda |
| **Factory** | Cria agregados garantindo invariantes desde o início | Pode morar em `domain/factories/` |
| **Specification** | Predicado reutilizável sobre o domínio | Útil para regras de "usuário pode X" |

## 3. Estado atual no projeto (varredura 2026-06-15)

```text
src/usuarios/domain/entities/usuario.entity.ts   ✓ entidade existe
src/usuarios/domain/repositories/usuario.repository.ts   ✓ interface
src/usuarios/infrastructure/repositories/prisma-usuario.repository.ts  ✓ impl

src/empresas/                                    ✓ entidade, repositório, service
src/perfis/                                      ✓ entidade, repositório, service
src/permissoes/                                  ✓ entidade, repositório, service
src/shared/domain/services/password-hasher.service.ts  ✓ domain service
```

| Bloco | Presente? | Observação |
|-------|-----------|-----------|
| Entidade | Sim | `BaseEntity` com `id`, `createdAt`, `updatedAt`, `deletedAt`, `ativo` |
| Value Object | **Parcial** | E-mail validado por `class-validator` no DTO, mas não há classe `Email`/`Cnpj` |
| Agregado explícito | **Gap** | A fronteira do agregado `Usuario` ↔ `UsuarioEmpresa` ↔ `Perfil` não está documentada nem protegida por invariantes |
| Repositório | Sim | Interface no `domain/`, impl no `infrastructure/` |
| Domain Service | Sim | `PasswordHasher` (interface) + `BcryptPasswordHasherService` (impl) |
| Application Service | Sim | `UsuariosService`, `AuthService`, etc. |
| Domain Event | **Gap** | Não há emitter nem subscribers — ação recomendada: priorizar |
| Factory | **Gap** | `new Usuario(...)` direto no service, sem invariantes protegidas |
| Specification | **Gap** | Lógica de "usuário pode X" espalhada no service |

### Veredito

A **estrutura de pastas** está alinhada com DDD/Clean, mas os **blocos táticos**
estão parcialmente implementados. O projeto está no caminho certo, mas há um
salto qualitativo a fazer em **agregados explícitos**, **value objects** e
**domain events**.

## 4. Princípios para esta base de código

### 4.1 Linguagem Ubíqua

**Regra**: o vocabulário dos PRs, dos `features/*.feature`, dos `*.entity.ts`,
dos `*.dto.ts` e dos comentários Swagger deve ser o mesmo.

| Termo canônico | Sinônimos a evitar |
|----------------|---------------------|
| Empresa (tenant) | Organização, conta, tenant |
| Perfil (escopado por empresa) | Role, papel, grupo |
| Permissão (código atômico) | Capability, scope, ação |
| Usuário (pessoa) | User, account, membro |
| Responsável (da empresa) | Owner, admin — **"responsável"** é o termo |

Ação: se você introduzir um sinônimo, **renomeie** o termo para o canônico em
todos os lugares (código, BDD, README, Swagger).

### 4.2 Modelos Ricos (evite *Anemic Domain Model*)

Uma entidade de domínio **não** é um DTO com getters. Ela **encapsula
comportamento** e **protege invariantes**.

```typescript
// ❌ Anemic — entidade só carrega dados; regras vivem no service
export class Usuario {
  id: number;
  email: string;
  ativo: boolean;
  deletedAt: Date | null;
}

// service.ts
if (!user.ativo || user.deletedAt) throw ...;
user.ativo = false;
user.deletedAt = new Date();
await this.repo.save(user);
```

```typescript
// ✅ Rich — invariantes e transições de estado são métodos da entidade
export class Usuario {
  private constructor(
    public readonly id: number,
    public readonly email: string,
    public readonly ativo: boolean,
    public readonly deletedAt: Date | null,
  ) {}

  static criar(input: { email: string }): Usuario {
    if (!Email.isValid(input.email)) throw new DomainError('E-mail inválido');
    return new Usuario(/*id temporário*/ 0, input.email, true, null);
  }

  restaurar(): Usuario {
    if (this.ativo && !this.deletedAt) {
      throw new DomainError('Usuário já está ativo.');
    }
    return new Usuario(this.id, this.email, true, null);
  }

  desativar(): Usuario {
    if (!this.ativo) return this;
    return new Usuario(this.id, this.email, false, new Date());
  }

  // helpers de leitura
  get isAtivo(): boolean { return this.ativo && !this.deletedAt; }
}
```

**Por que**: o service fica **magro** (orquestra I/O), e a regra vive com os
dados. Trocar a regra de "ativo" é trocar um método, não caçar `if`s espalhados.

### 4.3 Agregados explícitos

Um **agregado** é um cluster de objetos tratados como **uma unidade de
consistência**. A regra de ouro:

> **Não** se faz `repository.save()` de uma entidade interna do agregado. A
> persistência passa pela **raiz**.

No projeto:

| Agregado | Raiz | Membros | Invariantes |
|----------|------|---------|-------------|
| `Usuario` | `Usuario` | `RefreshToken[]`, `LoginHistory[]` | Ao desativar usuário, **revogar todos os refresh tokens** |
| `Empresa` | `Empresa` | `Perfil[]`, `UsuarioEmpresa[]` | Empresa sem responsável **não pode ser ativada** |
| `Perfil` | `Perfil` | `Permissao[]` (m:n) | Perfil de uma empresa **não pode** referenciar permissão deletada |

**Ação**: criar `domain/aggregates/<nome>.aggregate.ts` quando a invariante
precisar de mais de uma entidade. Por ora, podemos trabalhar com a raiz
agregando coleções.

### 4.4 Repositório carrega o agregado inteiro (ou nada)

```typescript
// Interface do agregado Usuario
export interface UsuarioRepository {
  findById(id: number): Promise<Usuario | null>;
  // carrega o agregado inteiro (com tokens, histórico opcional)
  findByIdWithRefreshTokens(id: number): Promise<Usuario | null>;
  save(usuario: Usuario): Promise<Usuario>;
}
```

**Anti-padrão** típico: o repositório tem 12 métodos `findByX` que retornam
DTOs crus do Prisma. Isso é um *leaky abstraction* — você vira refém do
schema do banco. **Correto**: o repositório retorna entidades de domínio (ou
agregados), e a conversão Prisma → domínio mora **dentro** do repositório.

### 4.5 Domain Events (próximo salto)

Quando algo importante acontece no domínio, a raiz do agregado emite um
**evento**. Outros contextos (mesmo processo ou não) reagem.

```typescript
export class Usuario {
  private events: DomainEvent[] = [];
  restaurar(): Usuario {
    // ...
    this.events.push(new UsuarioRestauradoEvent(this.id, new Date()));
    return new Usuario(this.id, this.email, true, null);
  }
  pullEvents(): DomainEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
```

**Casos de uso no projeto**:
- `Usuario.criado` → notificação de boas-vindas, criação de empresa padrão
- `Usuario.desativado` → revogação proativa de todos os `RefreshToken`
- `Empresa.excluida` (soft) → cascata em `Perfil`, `UsuarioEmpresa`
- `RefreshToken.reusado` → alerta de segurança, rotação forçada

**Adoção incremental**: comece criando 1 evento, 1 emitter, 1 subscriber
*in-process* (via `EventEmitter2` do Nest) **antes** de partir para fila.

## 5. Subdomínios (visão estratégica)

Em DDD, sistemas são divididos em **subdomínios** com naturezas diferentes:

| Tipo | Característica | No projeto |
|------|----------------|-----------|
| **Core** | Diferencial competitivo, modelar com cuidado | Multi-tenancy por empresa, perfis escopados, RBAC |
| **Supporting** | Apoia o core, mas não é o diferencial | CRUD de usuários, refresh tokens, audit log |
| **Generic** | Commodity, não inove | Autenticação JWT, throttling, paginação, validação |

**Implicação prática**: o **core** (multi-tenancy + RBAC) merece testes
rígidos (TDD, mutation testing), modelagem rica, value objects, e revisão
cuidadosa. **Generic** (ex.: paginação) pode reusar padrão pronto da
comunidade NestJS, sem reinventar.

## 6. Anti-padrões DDD a vigiar

| ❌ Anti | ✅ Correto |
|---------|-----------|
| Entidade anêmica (só dados) | Métodos de comportamento + invariantes na entidade |
| Lógica de negócio no controller | Lógica no service ou na entidade |
| Service "Deus" que faz tudo | Service de caso de uso (magro) + entidades (ricas) |
| Repositório retornando DTO/JSON do Prisma | Repositório retorna entidades de domínio |
| Mudar `ativo` direto no DB | Método `desativar()` na entidade emite `DomainEvent` |
| Validação no service com `if` espalhado | Value Object (`Email`, `Cnpj`) com `isValid()` |
| Persistir entidades filhas direto pelo repo | Sempre pela raiz do agregado |
| "DDD" como sinônimo de "Clean Architecture" | DDD é modelagem; arquitetura é meio |

## 7. Checklist de modelagem (use ao iniciar um módulo)

Ao criar um novo módulo, antes de escrever qualquer `controller.ts`:

- [ ] **Event Storming** rápido (5 min): Atores, Comandos, Eventos, Agregados
- [ ] **Linguagem Ubíqua** confirmada com o PO/BA (1 doc de 1 página)
- [ ] **Context Map**: este contexto fala com quais outros? Como?
- [ ] **Subdomínio classificado**: Core / Supporting / Generic
- [ ] **Agregados desenhados** (1 doc com raízes e invariantes)
- [ ] **Value Objects** identificados (o que é *imutável e por valor*)
- [ ] **Domain Events** mapeados (o que cada agregado pode emitir)
- [ ] Estrutura de pastas: `domain/{entities,repositories,services,events,vOs}`

## 8. Conexão com o workflow do projeto

| Fase | Saída |
|------|-------|
| **DDD** (Plan) | Este documento é a fonte. Saída concreta: agregados + entidades esqueleto em `src/<m>/domain/` |
| **BDD** (Plan) | `features/<m>.feature` — usa os mesmos verbos do agregado (`Quando o usuário é restaurado`) |
| **SDD** (Plan) | REQ-FN e REQ-NF referenciam agregados e entidades |
| **TDD** (Build) | Spec das entidades testa **métodos de comportamento** (não getters) |
| **Refactor** (Build) | Extrair Value Object, criar Domain Event, fortalecer invariante |

## 9. Referências

- Eric Evans — *Domain-Driven Design: Tackling Complexity in the Heart of Software* (2003)
- Vaughn Vernon — *Implementing Domain-Driven Design* (2013) — referência prática
- Vaughn Vernon — *Domain-Driven Design Distilled* (2016) — visão executiva
- Martin Fowler — *Patterns of Enterprise Application Architecture* (2002) — Repository, Aggregate Root
- Microsoft — *Domain-Driven Design for Microservices* (learn.microsoft.com)
- [`.agent/docs/06-arquitetura-hexagonal-nestjs.md`](./06-arquitetura-hexagonal-nestjs.md) — Hexagonal complementa DDD
- [`.agent/docs/07-clean-code-solid-typescript.md`](./07-clean-code-solid-typescript.md) — SOLID apoia modelagem rica
- [AGENTS.md §4 — Arquitetura](../../AGENTS.md#4-arquitetura) — estrutura de pastas
- [AGENTS.md §6 — Workflow DDD→BDD→SDD→ATDD→TDD](../../AGENTS.md#6-workflow-de-desenvolvimento-ddd--bdd--sdd--atdd--tdd)
