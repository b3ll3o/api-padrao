---
name: ddd-aggregate-modeling
description: Use when modeling a new module, defining aggregates, designing entity behavior, or deciding which repository methods to expose — applies to ensure the domain model is rich, aggregates are explicit, invariants are protected, and value objects replace primitive obsession.
last_updated: 2026-06-15
reviewer: analista-backend
---

# DDD — Modelagem de Agregados e Entidades Ricas

Como **modelar domínio** com blocos táticos de DDD (Aggregates, Entities,
Value Objects, Domain Events) aplicados a NestJS 11. Use quando for **iniciar
um novo módulo**, **refatorar uma entidade anêmica**, ou **decidir a fronteira
de consistência** entre entidades relacionadas.

## When to Use

Sintomas: "essa entidade é só dados", "a regra está espalhada no service",
"onde fica o método `desativar()`?", "qual é a raiz do agregado?",
"estamos vazando entre empresas", "essa classe tem 12 repositórios".

**Não** use para: detalhes de implementação de repositório (use
`prisma-query-optimization`), modelo de dados físico (use
`prisma-postgresql`), decisões de UI/controller.

## Heurística central — o "5-passos"

```text
1. Event Storming rápido (5 min)
   Atores, Comandos, Eventos, Agregados

2. Linguagem Ubíqua confirmada (1 doc)
   Termos canônicos em todo lugar (código, BDD, README)

3. Agregados desenhados (1 doc, 1 página)
   Raízes, membros, invariantes

4. Entidades esqueleto (1 PR)
   src/<m>/domain/entities com comportamento (não anêmica)

5. Repositórios como portas (1 PR)
   src/<m>/domain/repositories/* como interface
   src/<m>/infrastructure/repositories/Prisma* como impl
```

## 1. Identificando Agregados

### Pergunta de ouro

> **"Quando eu salvo X, quais outras entidades precisam ser consistentes
> comigo na mesma transação?"**

A resposta define o **limite do agregado**. Tudo dentro do limite é
salvo pela raiz; tudo fora é eventual (eventos).

### No projeto

| Agregado | Raiz | Membros | Invariante crítico |
|----------|------|---------|---------------------|
| `Usuario` | `Usuario` | `RefreshToken[]`, `LoginHistory[]` | Ao desativar, **revogar todos os refresh tokens** |
| `Empresa` | `Empresa` | `Perfil[]`, `UsuarioEmpresa[]` | Empresa sem responsável não pode ser ativada |
| `Perfil` | `Perfil` | `Permissao[]` (m:n) | Perfil não pode referenciar permissão deletada |
| `Auth` (sessão) | `RefreshToken` | - | Reuso = revogação em cadeia |

### Sintomas de agregado mal definido

| ❌ Sintoma | ✅ Correto |
|-----------|-----------|
| Repositório `update` em entidade filha | Repositório da **raiz** |
| "Persistência parcial" (parte do agregado fica) | Transação atômica na raiz |
| Service da raiz precisa carregar a filha sempre | Membro faz parte do agregado |
| Service da filha tem lógica que afeta a raiz | Mover para a raiz |

## 2. Entidades Ricas (anti-Anemic)

### Anti-padrão

```typescript
// ❌ Anêmica — sem comportamento
export class Usuario {
  @Exclude() id: number;
  email: string;
  ativo: boolean;
  deletedAt: Date | null;
}

// Service faz tudo
@Injectable()
export class UsuariosService {
  async desativar(id: number) {
    const user = await this.repo.findById(id);
    if (user.ativo === false) return user;        // ← regra no service
    user.ativo = false;                            // ← mutação exposta
    user.deletedAt = new Date();                   // ←
    return this.repo.save(user);                   // ← save "genérico"
  }
}
```

### Padrão correto

```typescript
// ✅ Rica — comportamento + invariantes
export class Usuario {
  private constructor(
    public readonly id: number,
    public readonly email: string,
    public readonly ativo: boolean,
    public readonly deletedAt: Date | null,
    public readonly revokedTokens: ReadonlyArray<RefreshToken>,
  ) {}

  static criar(input: {
    email: string;
    senhaHash: string;
    perfis: Perfil[];
  }): Usuario {
    if (!Email.isValid(input.email)) {
      throw new DomainError('EMAIL_INVALIDO', 'E-mail inválido.');
    }
    if (input.senhaHash.length < 40) {
      throw new DomainError('SENHA_FRACA', 'Hash de senha inválido.');
    }
    return new Usuario(0, input.email, true, null, []);
  }

  desativar(agora: Date = new Date()): Usuario {
    if (!this.ativo) return this;
    return new Usuario(this.id, this.email, false, agora, this.revokedTokens);
  }

  restaurar(): Usuario {
    if (this.ativo && !this.deletedAt) {
      throw new DomainError('USUARIO_JA_ATIVO', 'Usuário já está ativo.');
    }
    return new Usuario(this.id, this.email, true, null, []);
  }

  // helpers de leitura
  get isAtivo(): boolean { return this.ativo && !this.deletedAt; }
  temPermissao(codigo: string, empresaId: string): boolean {
    // delegate para a coleção interna
    return this.revokedTokens.every((t) => t.expiresAt > new Date());
  }
}
```

**Benefícios**:
- Regras **com os dados** (não espalhadas)
- **Imutabilidade**: cada mudança é um **novo objeto** (mais fácil de
  rastrear, testar, paralelizar)
- Service fica **magro** (orquestra I/O)
- Trocar regra = trocar **um método**, não caçar `if`s

### Migração gradual (sem reescrever tudo)

1. Identificar a **entidade mais crítica** (ex.: `Usuario`)
2. Adicionar **método estático `criar()`** com validação
3. Adicionar **método de transição** (`desativar`, `restaurar`)
4. Refatorar **um** service para usar o método
5. Repetir para outras entidades

## 3. Value Objects (VOs)

### O que é

Objeto **sem identidade**, definido pelos seus **valores**, **imutável**.

```typescript
// ✅ VO Email — encapsula validação + formatação
export class Email {
  private constructor(public readonly value: string) {}

  static criar(value: string): Email {
    if (!this.isValid(value)) {
      throw new DomainError('EMAIL_INVALIDO', `E-mail inválido: ${value}`);
    }
    return new Email(value.toLowerCase().trim());
  }

  static isValid(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 255;
  }

  get domain(): string { return this.value.split('@')[1]; }
  equals(other: Email): boolean { return this.value === other.value; }
}
```

### VOs candidatos no projeto

| VO | Onde morar | Por quê |
|----|-----------|---------|
| `Email` | `shared/domain/vos/email.vo.ts` | Validação centralizada, lowercase automático |
| `Cnpj` / `Cpf` | `shared/domain/vos/` | Validação de documento, normalização |
| `Uuid` | `shared/domain/vos/` | Validar antes de query (evita `findUnique` falhar) |
| `Senha` | `auth/domain/vos/senha.vo.ts` | Encapsula "mínimo 8, max 72, 1 maiúscula" |
| `Money` (futuro) | `<m>/domain/vos/money.vo.ts` | Centralizar precisão decimal |
| `Periodo` (futuro) | `<m>/domain/vos/periodo.vo.ts` | `inicio <= fim` como invariante |

## 4. Domain Events

### Quando emitir

> Algo **aconteceu** no passado (não vai acontecer) e **outros contextos
> podem querer reagir**.

```typescript
// events/usuario.events.ts
export class UsuarioCriadoEvent {
  readonly occurredAt = new Date();
  constructor(public readonly usuarioId: number, public readonly email: string) {}
}

export class UsuarioDesativadoEvent {
  readonly occurredAt = new Date();
  constructor(public readonly usuarioId: number, public readonly motivo: string) {}
}

// events/perfil.events.ts
export class PerfilPermissaoRemovidaEvent {
  readonly occurredAt = new Date();
  constructor(
    public readonly perfilId: number,
    public readonly empresaId: string,
    public readonly permissaoCodigo: string,
  ) {}
}
```

### Emissão pela raiz

```typescript
// entity
export class Usuario {
  private events: DomainEvent[] = [];
  // ...

  desativar(motivo: string): Usuario {
    if (!this.ativo) return this;
    this.events.push(new UsuarioDesativadoEvent(this.id, motivo));
    return new Usuario(this.id, this.email, false, new Date(), this.revokedTokens);
  }

  pullEvents(): DomainEvent[] {
    const e = [...this.events];
    this.events = [];
    return e;
  }
}

// service — após save, publica
async desativar(id: number, motivo: string) {
  const user = await this.repo.findById(id);
  const desativado = user.desativar(motivo);
  await this.repo.save(desativado);
  await this.eventBus.publishAll(desativado.pullEvents());
}
```

### Subscrição

```typescript
// listeners/usuario-desativado.listener.ts
@Injectable()
export class UsuarioDesativadoListener {
  constructor(
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly logger: Logger,
  ) {}

  @OnEvent(UsuarioDesativadoEvent.name)
  async handle(event: UsuarioDesativadoEvent) {
    this.logger.log({ userId: event.usuarioId }, 'Revogando tokens por desativação');
    await this.refreshTokenRepo.revokeAllForUser(event.usuarioId);
  }
}
```

### Adoção incremental

1. **1 evento**, 1 emitter, 1 listener in-process (Nest `EventEmitter2`)
2. Medir valor (vale a complexidade?)
3. Se sim, promover para **fila** (BullMQ) quando precisar de:
   - Garantia de entrega (out-of-process)
   - Retries com backoff
   - Múltiplos workers

**No projeto**: hoje **não há** Domain Events. **Gap recomendado**:
começar com `UsuarioCriadoEvent` (envio de e-mail de boas-vindas).

## 5. Repositório carrega o **agregado**

### Anti-padrão: repository com 12 métodos `findByX`

```typescript
// ❌
export interface UsuarioRepository {
  findById(id: number): Promise<Usuario | null>;
  findByEmail(email: string): Promise<Usuario | null>;
  findByEmailWithPerfis(email: string): Promise<any>;
  findByEmailWithPerfisAndPermissoes(email: string): Promise<any>;
  findAllActive(): Promise<any[]>;
  findByEmpresa(empresaId: string): Promise<any[]>;
  searchByName(name: string): Promise<any[]>;
  // ... 6 mais
}
```

### Padrão correto: agregados + intenção

```typescript
// ✅
export interface UsuarioRepository {
  // Agregado raiz
  findById(id: number): Promise<Usuario | null>;
  save(usuario: Usuario): Promise<Usuario>;

  // Casos de uso específicos (1 método por use case, não 1 por campo)
  findByEmailForAuthentication(email: string): Promise<UsuarioAggregate | null>;
  // ↑ carrega Usuario + Empresa + Perfis + Permissões (apenas o que login precisa)
}
```

**Regra**: prefira **1 método por caso de uso**, nomeado pelo
**propósito** (não pelo campo). Se 2 casos de uso precisam da mesma
visão do agregado, o método fica; senão, é code smell.

## 6. Domain Services (não Application Services)

### Domain Service

Lógica de domínio que **não cabe** em uma entidade específica.

```typescript
// shared/domain/services/password-hasher.service.ts
export abstract class PasswordHasher {
  abstract hash(senha: string): Promise<string>;
  abstract compare(senha: string, hash: string): Promise<boolean>;
}

// shared/domain/services/clock.service.ts
export abstract class Clock {
  abstract now(): Date;
}

// shared/domain/services/mailer.service.ts
export abstract class Mailer {
  abstract send(input: { to: string; subject: string; body: string }): Promise<void>;
}
```

**Quando criar**:
- Lógica que cruza **mais de um agregado** (ex.: "validação de permissão")
- Lógica que **toda** a aplicação precisa (ex.: `Clock`, `Mailer`, `CacheService`)
- Lógica que precisa ser **mockada** em testes (injetar `FakeClock`)

## 7. Linguagem Ubíqua — checklist

| Item | Onde verificar |
|------|----------------|
| **Termos canônicos** | AGENTS.md §5, BDD, Swagger, README |
| **Sinônimos** | `grep -R "user\|conta\|membro" src/` (deve ser 0 hits, só "usuario") |
| **Verbos dos use cases** | Service methods (ex.: `desativar`, `restaurar`) |
| **Eventos** | `Usuario.criado` (passado, sem verbo no imperativo) |

### Tabela canônica (projeto)

| Termo | Significado | Evite |
|-------|-------------|-------|
| **Empresa** | Tenant | Organização, conta, tenant |
| **Perfil** | Role escopado por empresa | Role, papel, grupo |
| **Permissão** | Código atômico global | Capability, scope, ação |
| **Usuário** | Pessoa | User, account, membro |
| **Responsável** | Dono da empresa | Owner, admin (no domínio) |
| **Soft delete** | `ativo=false, deletedAt=now` | "apagar", "remover" (físico) |
| **Restore** | `ativo=true, deletedAt=null` | "reativar", "ativar" |

## 8. Domain Errors (tipados)

```typescript
// shared/domain/errors/domain-error.ts
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

// Códigos canônicos
export const DOMAIN_CODES = {
  USUARIO_NAO_ENCONTRADO: 'USUARIO_NAO_ENCONTRADO',
  USUARIO_JA_ATIVO: 'USUARIO_JA_ATIVO',
  USUARIO_JA_DESATIVADO: 'USUARIO_JA_DESATIVADO',
  EMAIL_DUPLICADO: 'EMAIL_DUPLICADO',
  EMAIL_INVALIDO: 'EMAIL_INVALIDO',
  SENHA_FRACA: 'SENHA_FRACA',
  PERFIL_NAO_ENCONTRADO: 'PERFIL_NAO_ENCONTRADO',
  EMPRESA_SEM_RESPONSAVEL: 'EMPRESA_SEM_RESPONSAVEL',
  // ...
} as const;
```

**AllExceptionsFilter** mapeia `DomainError` → HTTP (ex.:
`USUARIO_NAO_ENCONTRADO` → 404).

## 9. Adoção incremental — roadmap

| Fase | O que fazer | Esforço |
|------|-------------|---------|
| **1** | Criar 1 VO (ex.: `Email`) + usar no `LoginUsuarioDto` | 1h |
| **2** | Adicionar método estático `criar()` em 1 entidade (`Usuario.criar`) | 2h |
| **3** | Refatorar 1 service para usar métodos da entidade | 1h |
| **4** | Emitir 1 Domain Event (in-process) com 1 listener | 2h |
| **5** | Mover 1 `if` espalhado em `criar()` da entidade | 30min |
| **6** | Documentar agregados em `.agent/docs/<m>-agregados.md` | 1h |

**Não** reescreva tudo. Cada fase é **independente** e gera valor.

## 10. Anti-padrões DDD a vigiar

| ❌ Anti | ✅ Correto |
|---------|-----------|
| Entidade anêmica (só dados) | Comportamento + invariantes na entidade |
| Lógica de negócio no controller | Domain ou Application service |
| Service "Deus" que faz tudo | 1 use case = 1 método |
| Repositório retornando DTO/JSON do Prisma | Retornar entidade de domínio |
| Persistir entidade filha direto | Pela raiz do agregado |
| Mutação exposta (`user.ativo = true`) | Método (`user.restaurar()`) |
| `if (user.role === 'admin')` | Permissão atômica + Strategy |
| `any` em VO/Entity | Tipo explícito |
| Domain importando `@nestjs/*` | Domain puro (TypeScript só) |
| Validar regra no `if` do service | VO ou método da entidade |

## 11. Checklist por módulo

Antes de marcar um módulo como "DDD-compliant":

```text
[ ] Agregado documentado (1 doc com raiz + membros + invariantes)
[ ] Entidades ricas (método criar + métodos de transição)
[ ] Pelo menos 1 VO (substituindo primitive obsession)
[ ] Pelo menos 1 Domain Event emitido
[ ] Repositório é interface no domain/, impl no infra/
[ ] Service NUNCA importa PrismaService
[ ] Domain não importa @nestjs/* nem @prisma/*
[ ] Erros tipados (DomainError com códigos)
[ ] TDD dos métodos da entidade (não só do service)
[ ] Linguagem Ubíqua respeitada (sinônimos = 0)
```

## 12. Reference

- [`.agent/docs/05-ddd-aplicado-nestjs.md`](../../docs/05-ddd-aplicado-nestjs.md) — DDD completo
- [`.agent/docs/06-arquitetura-hexagonal-nestjs.md`](../../docs/06-arquitetura-hexagonal-nestjs.md) — Hexagonal
- [`.agent/skills/hexagonal-ports-nestjs/SKILL.md`](../hexagonal-ports-nestjs/SKILL.md) — Ports & Adapters
- [`.agent/skills/clean-code-solid-typescript/SKILL.md`](../clean-code-solid-typescript/SKILL.md) — SOLID
- [AGENTS.md §6 — Workflow DDD→BDD→SDD→ATDD→TDD](../../../AGENTS.md#6-workflow-de-desenvolvimento-ddd--bdd--sdd--atdd--tdd)
