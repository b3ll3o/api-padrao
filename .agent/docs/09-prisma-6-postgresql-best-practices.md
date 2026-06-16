---
title: Best practices Prisma 6 + PostgreSQL 16
description: Schema, queries, migrations, performance, soft delete, connection pool, multi-tenancy
last_updated: 2026-06-15
reviewer: analista-backend
related:
  - 08-performance-otimizacao-apis-nestjs.md
  - 05-ddd-aplicado-nestjs.md
  - ../../AGENTS.md
---

# Best practices Prisma 6 + PostgreSQL 16

> Documento de referência sobre **Prisma 6** (versão atual do projeto)
> aplicado a **PostgreSQL 16**, com foco em schema, queries, migrations,
> performance, soft delete, multi-tenancy, e o **query extension** que o
> projeto usa para auto-filtrar `deletedAt: null`.

## 1. Estado atual no projeto

```text
prisma/schema.prisma        ← fonte de verdade do modelo
src/prisma/prisma.service.ts ← PrismaService estendido com soft-delete + Circuit Breaker
src/prisma/prisma-extension.ts ← softDeleteExtension (auto-filtra deletedAt)
```

- **Versão**: Prisma 6.15 (cliente e CLI)
- **Provider**: `postgresql`
- **Tabelas**: 7 (`Usuario`, `Empresa`, `Perfil`, `Permissao`, `UsuarioEmpresa`,
  `RefreshToken`, `LoginHistory`, `AuditLog`)
- **Soft delete**: `BaseEntity` (`id`, `createdAt`, `updatedAt`, `deletedAt`, `ativo`)
- **Extensão**: `softDeleteExtension` injeta `where: { deletedAt: null }` automaticamente
  em todas as queries (gap a auditar — ver §5)

## 2. Schema — boas práticas

### 2.1 Tipos de ID

```prisma
// ✅ UUID para entidades que podem ser expostas em URL
model Empresa {
  id String @id @default(uuid())
  // ...
}

// ✅ Autoincrement Int para entidades internas (FK barata)
model Usuario {
  id Int @id @default(autoincrement())
}
```

**No projeto**: `Empresa` usa `uuid`, `Usuario` usa `autoincrement Int` — **ok**.
**Regra geral**:
- **UUID**: se a entidade aparece em URL pública, sincroniza com sistema
  externo, ou tem risco de enumeração/IDOR.
- **Autoincrement**: se a entidade é puramente interna, ou o tamanho da PK
  importa (joins, índices menores).

### 2.2 Nomes e convenções

- **Tabela** = `PascalCase` em singular no Prisma (`Usuario`, `Empresa`)
  → vira `@@map("usuarios")` se quiser snake_plural no SQL.
- **Coluna** = `camelCase` → vira `"createdAt"` no SQL (Prisma gera
  `created_at` por default? Não — mantém camelCase entre aspas).
- **Índices**: `@@index([coluna1, coluna2])` — ordem importa (mais seletiva primeiro).
- **Unicidade**: `@@unique([a, b])` para chaves compostas.

**No projeto**: o schema usa singular (`Usuario`, `Perfil`, etc.) e os índices
estão OK para os padrões de query atuais (e.g. `[empresaId, deletedAt, ativo]`
em `Perfil` é composto e seletivo).

### 2.3 Relacionamentos

```prisma
// ✅ Explícito, com onDelete/onUpdate explícito
model Perfil {
  empresa   Empresa @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  empresaId String
}
```

**Decisões comuns**:
- `Cascade` (filho some com pai) — **risco**: apaga registros que podem
  ter valor histórico. Use com cuidado.
- `Restrict` (impede apagar pai se há filhos) — **padrão seguro**.
- `NoAction` (idem Restrict, default Prisma).
- `SetNull` (filho fica órfão) — **use quando faz sentido** (ex.:
  `responsavel` setado `null` ao deletar usuário).

**No projeto**: hoje não há `onDelete` explícito. **Recomendação**: revisar
e adicionar, especialmente para `UsuarioEmpresa` (cascade ao deletar empresa?).

### 2.4 Valores default

```prisma
// ✅ Defaults no schema — nunca confie na aplicação
createdAt DateTime  @default(now())
updatedAt DateTime  @updatedAt
ativo     Boolean   @default(true)
deletedAt DateTime?
```

**Princípio**: o **schema** é a fonte de verdade. Defaults na aplicação
são duplicação. Use `@default` no Prisma e confie.

### 2.5 Enums vs String

```prisma
// ❌ Evite enums do Prisma se os valores mudam com frequência
enum Status { ATIVO INATIVO }

// ✅ Use String + validação no DTO (flexível, fácil de evoluir)
status String @default("ATIVO")
```

**No projeto**: o schema usa `Boolean ativo` em vez de `String status`.
Decisão **ok** (mais simples, sem migração para adicionar estados). Se
precisar de mais estados no futuro, migrar para `String` com `@default("ATIVO")`.

## 3. Migrations — disciplina

### 3.1 Workflow

```bash
# Dev — gera e aplica
npx prisma migrate dev --name <descrição>

# CI/Prod — só aplica (nunca cria)
npx prisma migrate deploy

# Reset (apaga tudo) — APENAS em dev/staging
npx prisma migrate reset
```

### 3.2 Boas práticas

- **Nome da migration**: kebab-case descritivo
  (`add-empresa-responsavel`, `add-soft-delete-usuario`, não `init` ou `update`).
- **Nunca** edite uma migration já aplicada em prod.
- **Migration vazia**: crie com `prisma migrate dev --create-only` se precisar
  de SQL custom (ex.: índice CONCURRENTLY).
- **Backup antes** de migrations destrutivas em prod.

### 3.3 Migrações pesadas (lock)

```sql
-- ❌ Bloqueia a tabela
CREATE INDEX idx_perfil_empresa ON "Perfil"("empresaId");

-- ✅ PostgreSQL 11+ permite CONCURRENTLY (em migration vazia)
CREATE INDEX CONCURRENTLY idx_perfil_empresa ON "Perfil"("empresaId");
```

Em Prisma, use `migration.sql` manual para essas:

```bash
# Gera migration vazia
npx prisma migrate dev --create-only --name add-concurrent-index
# Edita prisma/migrations/<timestamp>_add-concurrent-index/migration.sql
# Roda prisma migrate dev para aplicar
```

### 3.4 Workflow do projeto

Já documentado em [`.agent/workflows/criar-migration.md`](../workflows/criar-migration.md).
**Resumo**: `npm run test:migrate` aplica as migrations para o E2E.

## 4. Queries — performance

### 4.1 `select` específico (sempre)

```typescript
// ❌ Pega tudo (incluindo `senha` que não deveria ir para o client)
const user = await this.prisma.usuario.findUnique({ where: { id } });

// ✅ Seleciona o que vai usar
const user = await this.prisma.usuario.findUnique({
  where: { id },
  select: { id: true, email: true, ativo: true, createdAt: true },
});
```

### 4.2 `include` planejado (resolver N+1)

```typescript
// ❌ N+1: 1 query + 1 por empresa
const empresas = await this.prisma.empresa.findMany();
for (const e of empresas) {
  e.perfis = await this.prisma.perfil.findMany({ where: { empresaId: e.id } });
}

// ✅ 1 query com JOIN
const empresas = await this.prisma.empresa.findMany({
  include: { perfis: true },
});

// ✅ Mais explícito: 1 query
const empresas = await this.prisma.empresa.findMany({
  select: {
    id: true, nome: true,
    perfis: { select: { id: true, nome: true, codigo: true } },
  },
});
```

**No projeto**: o `findByEmailWithPerfisAndPermissoes` faz `include` em
`empresas.perfis.permissoes` — bom, é 1 query. Mas atenção ao **número de
colunas** carregadas.

### 4.3 Paginação

```typescript
// ✅ Offset-based (projeto)
const page = await this.prisma.usuario.findMany({
  skip: (page - 1) * limit,
  take: limit,
  orderBy: { id: 'asc' },
});

// ✅ Cursor-based (lista muito grande, feed)
const next = await this.prisma.auditLog.findMany({
  take: 20,
  cursor: lastId ? { id: lastId } : undefined,
  skip: lastId ? 1 : 0,
  orderBy: { id: 'desc' },
});
```

**Regra**: para tabelas que crescem sem limite (`AuditLog`, `LoginHistory`),
**use cursor**. Para tabelas pequenas/médias (`Usuario`, `Empresa`),
**offset** (mais simples para UI com páginas) está OK.

### 4.4 Bulk operations

```typescript
// ❌ Loop sequencial
for (const u of users) {
  await this.prisma.usuario.create({ data: u });
}

// ✅ Bulk em 1 transação
await this.prisma.usuario.createMany({ data: users });

// ✅ Bulk update por filtro
await this.prisma.refreshToken.updateMany({
  where: { userId: id, revokedAt: null },
  data: { revokedAt: new Date() },
});
```

**No projeto**: o `AuthService.refreshTokens` faz `updateMany` para
revogar tokens — **bom exemplo**. Mas atenção: `createMany` **não** roda
hooks/triggers. Para lógica por registro, use loop + `Promise.all`.

### 4.5 Transações

```typescript
// ✅ Prisma $transaction com callback
await this.prisma.$transaction(async (tx) => {
  const user = await tx.usuario.create({ data });
  await tx.usuarioEmpresa.create({ data: { usuarioId: user.id, empresaId } });
  return user;
});

// ✅ Prisma $transaction array (independentes)
await this.prisma.$transaction([tx.usuario.create(...), tx.auditLog.create(...)]);
```

**Regra**: tudo que precisa ser **atômico** (criar usuário + vínculo) deve
estar em transação. Senão, falha parcial = inconsistência.

## 5. Soft delete — extensão `softDeleteExtension`

O projeto usa uma **extensão custom** que injeta `where: { deletedAt: null }`
em todas as queries, exceto as que optam por ver deletados. Referência:
[`src/prisma/prisma-extension.ts`](../../src/prisma/prisma-extension.ts).

### 5.1 Como funciona (em linhas gerais)

```typescript
// prisma-extension.ts
const softDeleteExtension = Prisma.defineExtension({
  query: {
    usuario: { // ← nome do model
      findMany: ({ args, query }) => {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      findFirst: ({ args, query }) => { /* idem */ },
      findUnique: ({ args, query }) => { /* idem */ },
      count: ({ args, query }) => { /* idem */ },
    },
    // ... repetir para cada model
  },
});
```

### 5.2 Pontos a auditar

- **Cobertura**: a extensão cobre **todos** os models? `Usuario`, `Empresa`,
  `Perfil`, `Permissao` — e `RefreshToken`, `LoginHistory`, `AuditLog`?
  O **AGENTS.md §4** diz que `AuditLog` e `LoginHistory` **não têm soft-delete**
  (são append-only). Confirmar que a extensão **não** filtra esses.
- **Restore**: `update` para setar `deletedAt = null` precisa **burlar** o filtro?
  O ideal: um método `repo.restore(id)` que faz `update` direto.
- **`include`**: ao incluir entidades filhas, o filtro é propagado?

### 5.3 Alternativa: `@@filter` no schema

Prisma 6 introduziu filtros nativos a nível de schema. **Considerar**
migrar a extensão custom para `@msf` (model-level filter) em uma release
futura — menos código, mais garantia.

## 6. Connection Pool — dimensionamento

### 6.1 Defaults

Prisma usa `num_physical_cpus * 2 + 1` conexões por instância Node.
Para 4 vCPUs = 9 conexões.

### 6.2 Tuning

```bash
# DATABASE_URL com pool custom
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=20&socket_timeout=10"
```

### 6.3 Regra para o Postgres

```text
max_connections no Postgres >= num_instancias_node × connection_limit + reservas (admin, superuser, etc.)
```

Exemplo: 4 instâncias × 9 conexões = 36 + 10 admin = 46.
Configurar `max_connections = 100` no Postgres (default: 100).

### 6.4 Postgres tuning básico

```ini
# postgresql.conf
max_connections = 100
shared_buffers = 256MB              # 25% da RAM
effective_cache_size = 768MB        # 75% da RAM
work_mem = 4MB                      # por operação de sort
maintenance_work_mem = 128MB
random_page_cost = 1.1              # SSD
```

## 7. Circuit Breaker — já existe

O `PrismaService` usa `opossum` (Circuit Breaker) com:
- `timeout: 5000ms`
- `errorThresholdPercentage: 50`
- `resetTimeout: 30000ms`

```typescript
// Uso
return this.prisma.runResilient(() => this.prisma.usuario.findMany());
```

**O que faz**: se 50% das chamadas falham em uma janela, **abre** o
circuito (próximas chamadas falham rápido por 30s). Depois **half-open**:
permite 1 chamada de teste. Se passar, **fecha** de novo.

**Por que importa**: protege contra **cascading failure** (DB lento
faz a API inteira travar). É um padrão **anti-camelo** — vale conhecer.

**Cuidado**: só use `runResilient` em **operações que toleram falha** ou
que se beneficiam de fail-fast. Para login (operação crítica de usuário),
considere **não** usar circuit breaker (ou ter fall-back graceful).

## 8. OpenTelemetry — instrumentação automática

O projeto já tem `@opentelemetry/instrumentation-prisma` (auto-instrumentation).
Isso injeta spans para todas as queries Prisma.

**Como aproveitar no Jaeger**:
1. Service: `api-padrao`
2. Tag: `db.system = postgresql`
3. Filtrar spans `prisma:*` para ver queries lentas

## 9. Multi-tenancy — segurança de query

### 9.1 Risco: esquecer o filtro `empresaId`

```typescript
// ❌ Vaza dados de outra empresa
async listar() {
  return this.prisma.perfil.findMany();
}

// ✅ Filtra por empresa (do context)
async listar(empresaId: string) {
  return this.prisma.perfil.findMany({ where: { empresaId } });
}
```

**O projeto**: hoje, a maioria dos repositories **não** recebe `empresaId`
explicitamente — o `EmpresaContext` é lido via `@EmpresaId()`. Verificar
se o repository o usa como filtro **sempre**.

### 9.2 Alternativa: Row-Level Security (RLS) do Postgres

```sql
-- Habilitar RLS
ALTER TABLE perfil ENABLE ROW LEVEL SECURITY;

-- Política: só vê perfis da empresa da sessão
CREATE POLICY empresa_isolation ON perfil
USING ("empresaId" = current_setting('app.empresa_id')::uuid);
```

```typescript
// Antes de cada query, setar a sessão
await this.prisma.$executeRaw`SET app.empresa_id = ${empresaId}`;
```

**Vantagem**: garantia **no banco**. Se um dev esquecer o filtro, o RLS
ainda protege. **Trade-off**: complexidade de sessão por request, e Prisma
não suporta nativamente — requer SQL manual.

**Recomendação para o projeto**: considerar RLS para tabelas multi-tenant
(`Perfil`, `UsuarioEmpresa`) como **defesa em profundidade**.

## 10. Boas práticas operacionais

| Item | Recomendação |
|------|-------------|
| **Backup** | `pg_dump` diário + WAL archiving (point-in-time recovery) |
| **Migrations em prod** | Rodar em janela de manutenção; `prisma migrate deploy` |
| **Slow query log** | `log_min_duration_statement = 500ms` no `postgresql.conf` |
| **`EXPLAIN ANALYZE`** | Use em qualquer query com p95 > 100ms |
| **`pg_stat_statements`** | Extensão para ver queries mais executadas/lentas |
| **Conexões idle** | `< idle_in_transaction_session_timeout > 60s` |
| **Vacuum** | `autovacuum = on` (default) — agendar se necessário |

## 11. Anti-padrões a vigiar

| ❌ Anti | ✅ Correto |
|---------|-----------|
| `findMany()` sem `take` | Sempre paginar |
| `findMany` com `select: undefined` | `select` específico |
| `findUnique({ where: { id: 'not-a-uuid' } })` sem `IsUUID` no DTO | Validar no DTO |
| `prisma.$queryRaw` sem parâmetro | `$queryRaw\`...\`` com template tag (proteção SQL injection) |
| Transação implícita no callback | `$transaction` explícito |
| Pool de conexões gigante | Dimensionado a `num_instancias × 9` |
| `delete` físico | Soft delete (já é padrão no projeto) |
| Migration com `prisma migrate reset` em prod | `prisma migrate deploy` |
| Esquecer filtro `empresaId` em query multi-tenant | Sempre filtrar, ou RLS |

## 12. Referências

- Prisma Docs — [prisma.io/docs](https://www.prisma.io/docs)
- Prisma 6 Release Notes — [github.com/prisma/prisma/releases](https://github.com/prisma/prisma/releases)
- PostgreSQL 16 Docs — [postgresql.org/docs/16](https://www.postgresql.org/docs/16/index.html)
- Use The Index, Luke — [use-the-index-luke.com](https://use-the-index-luke.com/)
- pgMustard — [pgmustard.com/docs](https://www.pgmustard.com/docs)
- [.agent/docs/08-performance-otimizacao-apis-nestjs.md](./08-performance-otimizacao-apis-nestjs.md)
- [.agent/docs/05-ddd-aplicado-nestjs.md](./05-ddd-aplicado-nestjs.md)
- [AGENTS.md §4 — Soft delete](../../AGENTS.md#4-arquitetura)
- [src/prisma/prisma.service.ts](../../src/prisma/prisma.service.ts)
