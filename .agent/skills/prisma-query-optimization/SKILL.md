---
name: prisma-query-optimization
description: Use when writing Prisma queries, designing indexes, debugging slow queries, or planning migrations — applies Prisma 6 + PostgreSQL 16 best practices to avoid N+1, reduce SELECTs, choose indexes, and handle transactions.
last_updated: 2026-06-15
reviewer: analista-backend
---

# Prisma 6 + PostgreSQL 16 — Query Optimization

Como **escrever queries Prisma performáticas**, **modelar índices** e
**evitar N+1** no projeto `api-padrao`. Use quando for **criar query**,
**modelar schema**, **auditar migration**, ou **investigar query lenta**.

## When to Use

Sintomas: "essa query demora", "tem 1+N", "qual índice criar?",
"select * tá pesado", "OFFSET 100000 travou", "transação parcial",
"pool saturado", "NÃO usar `include`?"

**Não** use para: decisões de arquitetura (use `hexagonal-ports-nestjs`),
tuning de HTTP (use `performance-profiling-nestjs`).

## 1. As 4 regras de ouro

```text
1. SELECT específico (select: { id, email })  — sempre
2. WHERE/ORDER BY com índice                  — sempre
3. include planejado (não loop com query)     — sempre
4. Paginação com take                         — sempre
```

## 2. SELECT específico

```typescript
// ❌ Pega tudo (incluindo senha, deletedAt, etc.)
const user = await this.prisma.usuario.findUnique({ where: { id } });

// ✅ Seleciona só o que vai usar
const user = await this.prisma.usuario.findUnique({
  where: { id },
  select: { id: true, email: true, ativo: true, createdAt: true },
});
```

**No projeto**: `findByEmailWithPerfisAndPermissoes` carrega **tudo**.
Em listagem, **considere** paginar perfis/permissões separadamente.

### Em queries com `include` → `select` aninhado

```typescript
// ✅ Listagem com select específico nos níveis
const empresas = await this.prisma.empresa.findMany({
  select: {
    id: true,
    nome: true,
    ativo: true,
    perfis: {
      select: { id: true, nome: true, codigo: true },
    },
  },
});
```

## 3. include planejado (anti N+1)

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
```

### Detector de N+1

```typescript
// Se você ver um for com await dentro, é N+1 em 90% dos casos
for (const x of items) {
  await this.repo.findByX(x.id); // ← suspeito
}
```

### Como refatorar N+1 com `include`

```typescript
// Antes: 2 queries (1 + N)
async listarPerfisComPermissoes(empresaId: string) {
  const perfis = await this.prisma.perfil.findMany({ where: { empresaId } });
  for (const p of perfis) {
    p.permissoes = await this.prisma.permissao.findMany({
      where: { perfis: { some: { id: p.id } } },
    });
  }
  return perfis;
}

// Depois: 1 query
async listarPerfisComPermissoes(empresaId: string) {
  return this.prisma.perfil.findMany({
    where: { empresaId, deletedAt: null, ativo: true },
    include: {
      permissoes: {
        where: { deletedAt: null, ativo: true },
        select: { id: true, codigo: true, nome: true },
      },
    },
  });
}
```

## 4. Índices

### Quando criar

```typescript
// WHERE: coluna usada em filtro
@@index([empresaId])
@@index([email])             // se for único, use @unique
@@index([deletedAt, ativo])  // soft delete

// ORDER BY: coluna usada em ordenação
@@index([createdAt(sort: Desc)])  // sort otimizado

// JOIN ON: coluna de FK
@@index([empresaId, usuarioId])  // FK em UsuarioEmpresa

// Composto: colunas em conjunto
@@index([empresaId, deletedAt, ativo])  // Perfil — filtro comum
```

**Ordem importa**: coluna mais seletiva **primeiro**.

### Como validar

```sql
EXPLAIN ANALYZE
SELECT * FROM "Perfil"
WHERE "empresaId" = $1 AND "deletedAt" IS NULL AND "ativo" = true
ORDER BY "createdAt" DESC LIMIT 10;
```

- `Seq Scan` = ruim (full table scan)
- `Index Scan` / `Index Only Scan` = bom
- `Bitmap Heap Scan` = aceitável para ranges

**No projeto**:

```prisma
// Perfil — já tem
@@index([empresaId, deletedAt, ativo])  // ✓ composto
@@unique([nome, empresaId])             // ✓ unicidade por tenant
@@unique([codigo, empresaId])           // ✓

// Usuario — tem
@@index([deletedAt, ativo])  // ✓

// Permissao — tem
@@index([deletedAt, ativo])  // ✓

// Gap: LoginHistory cresce sem índice de tempo
@@index([userId, createdAt])  // ← sugerir em migration
```

## 5. Paginação

### Offset (projeto)

```typescript
const page = await this.prisma.usuario.findMany({
  skip: (page - 1) * limit,
  take: limit,
  orderBy: { id: 'asc' },
});
```

**Problema**: `OFFSET 100000` é caro (Postgres precisa percorrer).
**Custo**: O(N + limit) onde N é o offset.

### Cursor (recomendado para tabelas grandes)

```typescript
const next = await this.prisma.auditLog.findMany({
  take: 20,
  cursor: lastId ? { id: lastId } : undefined,
  skip: lastId ? 1 : 0,
  orderBy: { id: 'desc' },
});
```

**Custo**: O(limit). **Não** depende do offset.

**Quando usar**:
- `Usuario`, `Empresa`, `Perfil` → **offset** (UI com páginas, dataset pequeno/médio)
- `AuditLog`, `LoginHistory` → **cursor** (cresce sem limite, feed infinito)

## 6. Bulk operations

```typescript
// ❌ Loop sequencial — 1 transação por item
for (const u of users) {
  await this.prisma.usuario.create({ data: u });
}

// ✅ createMany em 1 query
await this.prisma.usuario.createMany({ data: users });

// ✅ updateMany por filtro
await this.prisma.refreshToken.updateMany({
  where: { userId: id, revokedAt: null },
  data: { revokedAt: new Date() },
});
```

**Atenção**: `createMany` **não** roda hooks/triggers. Para lógica por
registro, use `Promise.all` com `create`:

```typescript
// Paraleliza — N queries simultâneas (cuidado com pool)
await Promise.all(users.map((u) => this.prisma.usuario.create({ data: u })));
```

**No projeto**: `AuthService.refreshTokens` faz `updateMany` para revogar
— **bom exemplo**.

## 7. Transações

```typescript
// ✅ $transaction com callback (transacional)
await this.prisma.$transaction(async (tx) => {
  const user = await tx.usuario.create({ data });
  await tx.usuarioEmpresa.create({
    data: { usuarioId: user.id, empresaId },
  });
  return user;
});

// ✅ $transaction array (operações independentes)
await this.prisma.$transaction([
  tx.usuario.create(...),
  tx.auditLog.create(...),
]);

// ⚠️ Isolation level
await this.prisma.$transaction(
  async (tx) => { /* ... */ },
  { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
);
```

**Regra**: tudo que precisa ser **atômico** (criar usuário + vínculo)
deve estar em transação. Senão, falha parcial = inconsistência.

## 8. Soft delete — auto-filtro

O projeto usa `softDeleteExtension` (em `src/prisma/prisma-extension.ts`)
que injeta `where: { deletedAt: null }` automaticamente.

### Como o filtro é propagado?

```typescript
// Funciona?
const perfis = await this.prisma.perfil.findMany({
  where: { empresaId },
  include: { permissoes: true },
});
// Filtro: perfis.deletedAt = null E permissoes.deletedAt = null? ← depende da impl
```

**Auditoria recomendada**:

```bash
# 1. Extensão cobre TODOS os models?
grep -A 5 "query:" src/prisma/prisma-extension.ts

# 2. Models sem soft-delete (AuditLog, LoginHistory) não devem ter filtro
# 3. Update/Restore burlam o filtro (a extensão pode ter gap)
```

### Restore (sem filtro deletedAt)

```typescript
// ✅ Método explícito no adapter
@Injectable()
export class PrismaUsuarioRepository implements UsuarioRepository {
  async restore(id: number): Promise<Usuario> {
    return this.prisma.extended.usuario.update({
      where: { id },
      data: { deletedAt: null, ativo: true },
    });
  }
}
```

## 9. Connection Pool

### Default Prisma

```text
num_physical_cpus * 2 + 1
4 vCPUs = 9 conexões por instância Node
```

### Tuning via URL

```bash
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20&socket_timeout=10"
```

### Postgres `max_connections`

```text
max_connections >= num_instancias × connection_limit + reservas
```

Exemplo: 4 instâncias × 9 = 36 + 10 admin = 46. Configurar `max_connections = 100`.

## 10. Migrations

### Workflow

```bash
# Dev — gera e aplica
npx prisma migrate dev --name <descrição>

# CI/Prod — só aplica
npx prisma migrate deploy
```

### Migração pesada (CONCURRENTLY)

```bash
# Gera migration vazia
npx prisma migrate dev --create-only --name add-concurrent-index

# Edita: prisma/migrations/<ts>_add-concurrent-index/migration.sql
# CREATE INDEX CONCURRENTLY idx_perfil_empresa ON "Perfil"("empresaId");
```

**Por que**: `CREATE INDEX` (padrão) **locka** a tabela. `CONCURRENTLY`
não — mais lento, mas **zero downtime** em prod.

### Backup antes de migração destrutiva

```bash
pg_dump -Fc mydb > backup_pre_migration.dump
```

## 11. Circuit Breaker (já existe)

```typescript
// src/prisma/prisma.service.ts
constructor() {
  this.breaker = new CircuitBreaker(/* ... */, {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  });
}

async runResilient<T>(fn: () => Promise<T>): Promise<T> {
  return this.breaker.fire(fn) as Promise<T>;
}
```

**Quando usar**: operações **tolerantes a falha** (cache miss que vai ao DB).
**Quando NÃO usar**: autenticação (login é crítico, falhar rápido pode ser pior).

## 12. Multi-tenancy — filtro `empresaId`

```typescript
// ❌ Vaza dados de outra empresa
async listar() {
  return this.prisma.perfil.findMany();
}

// ✅ Filtra por empresa (do context)
async listar(@EmpresaId() empresaId: string) {
  return this.prisma.perfil.findMany({ where: { empresaId } });
}
```

**No projeto**: verificar se **todos** os repositórios filtram por `empresaId`.

### Alternativa: Row-Level Security (RLS)

```sql
ALTER TABLE perfil ENABLE ROW LEVEL SECURITY;
CREATE POLICY empresa_isolation ON perfil
USING ("empresaId" = current_setting('app.empresa_id')::uuid);
```

**Vantagem**: defesa em profundidade no banco. **Trade-off**: Prisma não
suporta nativamente (SQL manual por request).

## 13. Métricas de query

```sql
-- Habilitar pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

```sql
-- Queries mais lentas
SELECT
  substring(query, 1, 100) AS query,
  mean_exec_time,
  calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

## 14. Anti-padrões a vigiar

| ❌ Anti | ✅ Correto |
|---------|-----------|
| `findMany()` sem `take` | Sempre paginar |
| `findMany` com `select: undefined` | `select` específico |
| `findUnique` com id não validado | `@IsUUID` no DTO |
| `prisma.$queryRaw` com concatenação | `$queryRaw\`...\`` com template tag |
| Transação implícita em callback | `$transaction` explícito |
| Pool gigante (esgota Postgres) | `num_instancias × 9` |
| `delete` físico | Soft delete (projeto) |
| `prisma migrate reset` em prod | `prisma migrate deploy` |
| Esquecer filtro `empresaId` (multi-tenant) | Sempre filtrar ou RLS |
| `console.log(prisma.X)` | OpenTelemetry span |

## 15. Checklist de auditoria de queries

```text
[ ] SELECT específico (não SELECT *)
[ ] WHERE/ORDER BY tem índice
[ ] include planejado (sem N+1)
[ ] take definido (paginação)
[ ] Transação quando atômico
[ ] Filtro empresaId (multi-tenant)
[ ] Bulk quando apropriado
[ ] Conexão do pool (não por request)
[ ] Migrations com backup se destrutiva
[ ] EXPLAIN ANALYZE em queries com p95 > 100ms
[ ] Slow query log habilitado em prod
```

## 16. Reference

- [`.agent/docs/09-prisma-6-postgresql-best-practices.md`](../../docs/09-prisma-6-postgresql-best-practices.md) — completo
- [`.agent/skills/performance-profiling-nestjs/SKILL.md`](../performance-profiling-nestjs/SKILL.md) — performance
- [`.agent/skills/hexagonal-ports-nestjs/SKILL.md`](../hexagonal-ports-nestjs/SKILL.md) — onde mora Prisma
- Prisma Docs — [prisma.io/docs](https://www.prisma.io/docs)
- PostgreSQL 16 — [postgresql.org/docs/16](https://www.postgresql.org/docs/16/index.html)
- Use The Index, Luke — [use-the-index-luke.com](https://use-the-index-luke.com/)
- [AGENTS.md §4 — Soft delete](../../../AGENTS.md#4-arquitetura)
- [src/prisma/prisma.service.ts](../../../src/prisma/prisma.service.ts)
