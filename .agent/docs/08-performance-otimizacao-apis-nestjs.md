---
title: Performance de software e otimização de APIs Node/NestJS
description: Latência, throughput, profiling, caching, connection pooling, observabilidade aplicada
last_updated: 2026-06-15
reviewer: analista-backend
related:
  - 09-prisma-6-postgresql-best-practices.md
  - 10-fastify-nestjs-best-practices.md
  - 11-redis-bullmq-cache-best-practices.md
  - 12-opentelemetry-observabilidade.md
  - ../../AGENTS.md
---

# Performance de software e otimização de APIs Node/NestJS

> Documento de referência sobre **performance de APIs Node.js** aplicadas ao
> NestJS 11 + Fastify + Prisma + Redis do projeto `api-padrao`. Foco:
> **medir antes de otimizar**, gargalos comuns em NestJS, e como
> **transformar otimização em hábito** (profiling, budgets, gates em CI).

## 1. Mentalidade: **medir, não adivinhar**

> *"Premature optimization is the root of all evil."* — Donald Knuth

A primeira regra de performance é **não otimizar** o que não foi
**medido**. As cinco fases:

```text
1. Medir (baseline)            → "Quanto tempo está levando?"
2. Identificar o gargalo       → "Onde exatamente?"
3. Formular hipótese           → "Trocar X por Y deve ajudar?"
4. Testar a hipótese           → "Implementar X e medir de novo."
5. Decidir: manter ou reverter → "Ajudou? Manter. Não ajudou? Reverter."
```

**Nunca** otimize por "achismo" ou por "eu acho que isso é lento".

## 2. Métricas que importam (latência × throughput)

| Métrica | O que é | Alvo saudável (API REST) |
|---------|---------|--------------------------|
| **p50** (mediana) | Latência mediana | < 50 ms |
| **p95** | 95% das requests abaixo | < 200 ms (read) / < 500 ms (write) |
| **p99** | 99% das requests abaixo | < 1 s |
| **Throughput** | Requests por segundo | Depende do hardware — defina o alvo |
| **Error rate** | % de 5xx | < 0.1% |
| **CPU** | % em uso | < 70% médio |
| **Memória RSS** | Uso de heap | < 150 MB (alvo deste projeto, ver `/health/live`) |
| **Event-loop lag** | Atraso do loop | < 100 ms |
| **DB connections** | Conexões ativas | < 80% do pool |

**O alvo vence o número absoluto**: o projeto tem RNF específicos
(ex.: `REQ-<M>-N01: login SHALL responder em p95 ≤ 200ms`).
**Defina o RNF primeiro**, depois meça.

## 3. Profiling — como achar o gargalo

### 3.1 Em dev/local — `clinic.js`

```bash
# Profila CPU, event-loop, async/await
npx clinic doctor -- node dist/main
npx clinic flame -- node dist/main   # gera flamegraph
npx clinic bubbleprof -- node dist/main
```

**Quando usar**: quando o dev quer entender **por que** algo está lento.

### 3.2 Em prod/staging — APM (OpenTelemetry)

Já temos OpenTelemetry → Jaeger (ver `src/tracing.ts` e `.openspec/`).
Use **traces** para achar o span mais lento de uma request lenta.

```bash
# No Jaeger UI: filtrar por service=api-padrao, tag http.status_code=500
# ou minLatency=1s, ver spans em ordem de duração
```

### 3.3 Logs estruturados (já temos — `nestjs-pino`)

```typescript
this.logger.log({ usuarioId, duracaoMs, hits: cacheHits }, 'listagem concluída');
```

Pino injeta automaticamente o `requestId` (x-request-id), o que permite
**rastrear uma request lenta** end-to-end.

### 3.4 Métricas de aplicação (recomendação)

Adicionar `prom-client` para expor `/metrics` no formato Prometheus:

```typescript
import { Counter, Histogram, Registry } from 'prom-client';
const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
});
```

Combine com Grafana para **dashboards** (latência por rota, error rate,
DB query time).

## 4. Gargalos comuns em NestJS — e o que fazer

### 4.1 Banco de dados (causa #1 de lentidão)

| Sintoma | Causa provável | Ação |
|---------|---------------|------|
| `p95` alto em listagem | `SELECT *` + N+1 | `select` específico + `include` ou `JOIN` planejado |
| `prisma.x.findMany` lento | Falta índice | Adicionar `@@index` no `schema.prisma` + migration |
| Timeouts intermitentes | Pool de conexões saturado | Ajustar `connection_limit` |
| `PrismaService` bloqueia event loop | Query síncrona/blocking | Já é async — verificar query em loop síncrono |

Detalhamento em [`.agent/docs/09-prisma-6-postgresql-best-practices.md`](./09-prisma-6-postgresql-best-practices.md).

### 4.2 Event loop bloqueado

Node.js é **single-threaded** no event loop. Se uma função **síncrona**
demora, **toda a aplicação** trava.

**Causas comuns em Nest**:
- `bcrypt` em **rota HTTP** (CPU-bound, pode ser 100-300ms)
- `JSON.parse` de payload gigante
- Loops síncronos grandes
- `crypto` síncrono

**Mitigações**:

```typescript
// ❌ bcrypt na thread do event loop
@Post('login')
async login(@Body() dto: LoginUsuarioDto) {
  return bcrypt.compare(dto.senha, user.senha); // bloqueia
}

// ✅ worker_threads ou pool (já feito com opossum circuit breaker; ou use argon2 nativo)
@Post('login')
async login(@Body() dto: LoginUsuarioDto) {
  return this.passwordHasher.compare(dto.senha, user.senha);
}
// PasswordHasher usa bcrypt — considerar argon2 (nativo) ou worker pool
```

**Para o projeto**: o `BcryptPasswordHasherService` faz `bcrypt.compare`
**na thread do event loop**. Em produção com 100 RPS, isso pode ser
problema. Considerar `argon2` (nativo, mais rápido) ou `bcrypt` com
worker pool.

### 4.3 N+1 queries

```typescript
// ❌ N+1: 1 query para empresas, N para cada empresa
const empresas = await this.empresaRepo.findAll();
for (const e of empresas) {
  e.perfis = await this.perfilRepo.findByEmpresa(e.id); // +1 query por empresa
}

// ✅ Prisma include resolve em 1 query com JOIN
const empresas = await this.prisma.empresa.findMany({
  include: { perfis: true },
});
```

**No projeto**: auditar todos os `for` que disparam query. Em Nest, isso
costuma aparecer em **mappers** (loop convertendo entidade Prisma → domínio).

### 4.4 Logging verboso

```typescript
// ❌ Em dev roda bem; em prod, custo alto
pinoHttp: { level: 'debug' }

// ✅ Em prod, info ou warn
pinoHttp: { level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' }
```

**No projeto**: `main.ts` já diferencia dev vs prod (info em prod) — **ok**.
Mas atenção a **logs dentro de loops** que multiplicam o custo.

### 4.5 Memória

- **Vazamentos de memória**: subscriptions não canceladas, listeners que
  ficam vivos, caches sem TTL.
- **Heap grande**: estruturas que crescem indefinidamente.

**Diagnóstico**: `node --inspect` + Chrome DevTools → Memory tab → Heap snapshot.

**No projeto**: o `LoginHistory` e `AuditLog` crescem indefinidamente.
**Ação recomendada**: job de retenção (BullMQ agendado, ex.: apagar
`LoginHistory` > 90 dias).

### 4.6 Caches mal desenhados

- Cache **sem TTL** → dados velhos
- Cache **com TTL muito curto** → cache miss constante
- **Thundering herd** (muitos requests batem no DB ao expirar o cache)
- Cache **de valores que mudam sempre** → invalidação complexa

Detalhamento em [`.agent/docs/11-redis-bullmq-cache-best-practices.md`](./11-redis-bullmq-cache-best-practices.md).

## 5. Estratégias de otimização (do mais barato ao mais caro)

| Estratégia | Custo | Quando usar |
|------------|-------|-------------|
| **Medir + remover N+1** | Baixo | Sempre que houver loops com query |
| **Adicionar índice** | Baixo | Query lenta com `WHERE`/`ORDER BY` |
| **Cache de leitura** | Médio | Read-heavy, dados com latência aceitável |
| **Paginação cursor-based** | Médio | Listas grandes (`OFFSET 100000` é caro) |
| **Compressão gzip/brotli** | Baixo | Responses > 1 KB |
| **HTTP/2 + keep-alive** | Médio | Múltiplas requests por cliente |
| **Worker pool** (bcrypt, image) | Médio | CPU-bound na rota |
| **Read replicas** | Alto | Sobrecarga de leitura no DB |
| **Sharding** | Muito alto | Volume massivo (> 100 GB / > 1k RPS) |
| **Service worker / cron** | Médio | Tarefas pesadas fora do request |
| **BullMQ job assíncrono** | Médio | Trabalho demorado que pode ser diferido |

## 6. Fastify vs Express — por que o projeto usa Fastify

| Aspecto | Fastify (projeto) | Express |
|---------|------------------|---------|
| Performance | **2-3x mais rápido** | Baseline |
| Schema validation | Nativa (JSON Schema) | Middleware |
| Plugins | `fastify-plugin` | `app.use()` |
| Logger | Integrado (pino) | winston/morgan |
| Async/await | First-class | Wrapper |
| Body parsing | `application/json` nativo | `body-parser` |
| Tamanho | Menor | Maior |

**Implicações práticas**:
- Use `req.headers` (Fastify) — é mais rápido que `req.get('X-Header')` do Express.
- Não use middlewares Express (`req, res, next`) — Fastify usa hooks.
- `@nestjs/platform-fastify` abstrai a maioria dessas diferenças.

## 7. PostgreSQL + Prisma — alavancas de performance

### 7.1 Connection pool

```prisma
// schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // pool default do Prisma = num_physical_cpus * 2 + 1
  // Para 4 vCPUs = 9 conexões por instância Node
}
```

**Tuning**: ajustar `?connection_limit=10&pool_timeout=20` na URL.
**Não** use `connection_limit=1000` — esgota o `max_connections` do Postgres.

### 7.2 Índices

```prisma
// ✅ Índices compostos (ordem importa: coluna mais seletiva primeiro)
@@index([empresaId, deletedAt, ativo]) // Perfil
@@index([deletedAt, ativo])           // Usuario
```

**Regra de ouro**: índice em coluna usada em `WHERE`, `ORDER BY`, `JOIN ON`.

### 7.3 `EXPLAIN ANALYZE`

```sql
EXPLAIN ANALYZE
SELECT * FROM "Perfil"
WHERE "empresaId" = $1 AND "deletedAt" IS NULL AND "ativo" = true
ORDER BY "createdAt" DESC LIMIT 10;
```

- `Seq Scan` = ruim (full table scan)
- `Index Scan` / `Index Only Scan` = bom
- `Bitmap Heap Scan` = aceitável para ranges

### 7.4 `select` específico

```typescript
// ❌ Pega tudo
const user = await this.prisma.usuario.findUnique({ where: { id } });

// ✅ Pega só o que precisa
const user = await this.prisma.usuario.findUnique({
  where: { id },
  select: { id: true, email: true, ativo: true },
});
```

**No projeto**: vale auditar — `findByEmailWithPerfisAndPermissoes` carrega
**tudo**; em listagem, considere paginar perfis/permissões separadamente.

## 8. Caching — checklist de decisão

**Quando cachear** (pergunta de 4 pontos):

1. **É read-heavy?** (> 10 reads por write) → **sim, cache**
2. **Tolera staleness?** (segundos/minutos) → **sim, cache**
3. **É caro de calcular?** (DB query lento, join pesado) → **sim, cache**
4. **Não é dado pessoal sensível** (LGPD) → **sim, cache**

Se 3/4 → cache. Se 0-2/4 → não cacheie.

**Padrão de cache** recomendado:

```typescript
async findById(id: number) {
  const cacheKey = `usuario:${id}`;
  const cached = await this.cache.get<Usuario>(cacheKey);
  if (cached) return cached;

  const user = await this.userRepo.findById(id);
  if (user) await this.cache.set(cacheKey, user, { ttl: 600 });
  return user;
}
```

**Invalidar** ao escrever: `this.cache.del('usuario:' + id)` no `update`
e `delete`.

## 9. Paginação — qual usar

| Tipo | Como | Quando |
|------|------|--------|
| **Offset** | `skip: 20, take: 10` | UI com "página 1, 2, 3" |
| **Cursor** | `cursor: { id: 100 }, take: 10` | Feed infinito, dados que mudam |
| **Keyset** | `WHERE id > 1000 ORDER BY id LIMIT 10` | Performance crítica em listas grandes |

**No projeto**: `PaginationDto` usa offset. **Recomendação**: para `audit_log`
e `login_history`, considerar cursor (esses logs crescem indefinidamente).

## 10. Network — alavancas

| Alavanca | Quando |
|----------|--------|
| **Compressão (`Content-Encoding: br`)** | Response > 1 KB |
| **HTTP keep-alive** | Sempre (já é default no HTTP/1.1+) |
| **HTTP/2 multiplexing** | Múltiplas requests por cliente (SPA) |
| **CDN** | Assets estáticos |
| **`ETag` / `Cache-Control`** | Recursos com versão |
| **Streaming** (Fastify) | Resposta grande (relatórios) |

**No projeto**: `@fastify/helmet` está presente, mas **não há compressão**
habilitada. Adicionar `@fastify/compress` para responses JSON grandes.

## 11. Performance Budget — disciplina

Defina o **orçamento** (budget) e **cobre-o com testes**:

```typescript
// RNF no design.md
// REQ-AUTH-N01 [SHALL] Login SHALL responder em p95 ≤ 200ms.

// Teste de aceitação (k6, autocannon, ou jest+supertest com timing)
it('deve responder login em < 200ms p95 (1000 samples)', async () => {
  const samples: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const t0 = process.hrtime.bigint();
    await request(app).post('/auth/login').send(credenciais);
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)];
  expect(p95).toBeLessThan(200);
});
```

**Em CI**: rode o budget **antes do merge** se possível.

## 12. Connection Pool & Resource Management

- **DB pool**: configurar `connection_limit` com base em
  `num_instances × concurrency` — não pode ultrapassar `max_connections` do Postgres.
- **Redis pool**: `cache-manager-redis-yet` e BullMQ têm defaults razoáveis.
- **HTTP clients** (`@nestjs/axios`): criar **uma instância** e reutilizar.
- **Worker threads** (CPU-bound): pool dimensionado a `num_cpus - 1`.

## 13. Anti-padrões de performance a vigiar

| ❌ Anti | ✅ Correto |
|---------|-----------|
| Otimizar sem medir | Profile + medir antes |
| Cache de tudo | Cache seletivo (4 pontos) |
| `await` em loop síncrono | `Promise.all` para paralelizar |
| `findMany` sem `select` | `select` específico |
| `findMany` sem `take` | Sempre paginar |
| `bcrypt` na thread do event loop | Worker pool ou argon2 |
| `console.log` em hot path | Pino com level apropriado |
| Conexão DB por request | Pool de conexões |
| Query em loop | JOIN planejado + `include` |
| Otimizar micro (1ns) | Foco no macro (ms) |

## 14. Quando o monolito não aguenta — sinais

- Latência crescendo > 10% ao mês sem aumento de uso
- Pool de conexões saturado
- CPU > 80% constantemente
- Deploys viram momento de pânico

**Soluções (em ordem)**:
1. **Vertical scale** (CPU/RAM) — primeiro passo, mais barato
2. **Read replicas** — quando leitura domina
3. **Cache agressivo** (Redis) — read-heavy
4. **Filas** (BullMQ) — work assíncrono
5. **Sharding / microserviço** — só se tudo acima falhar

## 15. Referências

- Brendan Gregg — *Systems Performance* (2020) — livro definitivo
- Alex Xu — *System Design Interview* (Vol 1 & 2) — padrões de arquitetura
- Node.js Docs — [Performance](https://nodejs.org/en/docs/guides/simple-profiling)
- `clinic.js` — [clinicjs.org](https://clinicjs.org/)
- Fastify Docs — [fastify.io/docs/latest/](https://fastify.io/docs/latest/)
- Prisma Docs — [prisma.io/docs/guides/performance-and-optimization](https://www.prisma.io/docs/guides/performance-and-optimization)
- PostgreSQL Docs — [Performance Tips](https://www.postgresql.org/docs/current/performance-tips.html)
- [`.agent/docs/09-prisma-6-postgresql-best-practices.md`](./09-prisma-6-postgresql-best-practices.md)
- [`.agent/docs/10-fastify-nestjs-best-practices.md`](./10-fastify-nestjs-best-practices.md)
- [`.agent/docs/11-redis-bullmq-cache-best-practices.md`](./11-redis-bullmq-cache-best-practices.md)
- [AGENTS.md §9 — Infra e Observabilidade](../../AGENTS.md#9-infra-e-observabilidade)
