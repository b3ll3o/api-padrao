---
name: performance-profiling-nestjs
description: Use when investigating slow endpoints, optimizing hot paths, choosing caching strategies, or designing pagination — applies performance heuristics (measure first, fix N+1, cache selectively) to NestJS + Prisma + Redis code.
last_updated: 2026-06-15
reviewer: analista-backend
---

# Performance e Profiling de APIs NestJS

Como **medir, identificar gargalos e otimizar** APIs NestJS 11 do projeto
`api-padrao`. Use quando houver **endpoint lento**, suspeita de N+1, ou
decisão de **quando cachear** vs **quando buscar no DB**.

## When to Use

Sintomas: "endpoint demora 2s", "p95 acima do RNF", "tá com N+1",
"deveria cachear?", "lista paginada com OFFSET 100000", "CPU alta",
"memória crescendo".

**Não** use para: tuning de query Prisma (use `prisma-query-optimization`),
configuração de OpenTelemetry (use `opentelemetry-tracing`).

## Mentalidade: **medir primeiro**

> *"Premature optimization is the root of all evil."* — Donald Knuth

```text
1. Medir (baseline)            → quanto tempo está levando?
2. Identificar o gargalo       → onde exatamente?
3. Formular hipótese           → trocar X por Y deve ajudar?
4. Testar a hipótese           → implementar X e medir de novo.
5. Decidir: manter ou reverter → ajudou? Manter. Não ajudou? Reverter.
```

**Nunca** otimize sem medir antes/depois.

## 1. Métricas que importam

| Métrica | O que é | Alvo típico |
|---------|---------|-------------|
| **p50** (mediana) | Latência mediana | < 50 ms |
| **p95** | 95% abaixo | < 200 ms (read) / < 500 ms (write) |
| **p99** | 99% abaixo | < 1 s |
| **Throughput** | RPS | Definir no SDD |
| **Error rate** | % 5xx | < 0.1% |
| **CPU** | % em uso | < 70% médio |
| **Memória RSS** | Heap | < 150 MB (alvo do projeto) |
| **Event-loop lag** | Atraso do loop | < 100 ms |
| **DB connections** | Conexões ativas | < 80% do pool |

**Sempre** alinhe com o **RNF do design.md** (ex.: `REQ-AUTH-N01: login SHALL responder em p95 ≤ 200ms`).

## 2. Como medir

### 2.1 Local — `clinic.js`

```bash
npm install -g clinic
clinic doctor -- node dist/main       # CPU, event-loop, async
clinic flame -- node dist/main        # flamegraph
clinic bubbleprof -- node dist/main   # async/await
```

### 2.2 Staging/Prod — OpenTelemetry → Jaeger

Já temos OTel (ver `opentelemetry-tracing` skill). Use:

```text
Service: api-padrao
Operation: prisma:query (ou http.POST /auth/login)
Min latency: 1s
```

### 2.3 Logs — Pino (estruturado)

```typescript
this.logger.log({ usuarioId, duracaoMs, hits: cacheHits }, 'listagem concluída');
```

Pino injeta `requestId` (x-request-id) automaticamente — correlacione com o trace.

### 2.4 Métricas Prometheus (recomendação)

```bash
npm install @willsoto/nestjs-prometheus prom-client
```

```typescript
// src/shared/infrastructure/metrics/metrics.module.ts
@Module({
  imports: [PrometheusModule.register({ defaultMetrics: { enabled: true } })],
})
export class MetricsModule {}
```

Endpoint `GET /metrics` (proteger com auth/firewall).

### 2.5 Teste de carga (k6)

```javascript
// load-test.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,           // 50 usuários virtuais
  duration: '30s',    // 30s
  thresholds: {
    http_req_duration: ['p(95)<200'],  // p95 < 200ms
    http_req_failed: ['rate<0.01'],    // < 1% erro
  },
};

export default function () {
  const res = http.post('http://localhost:3001/auth/login', JSON.stringify({
    email: 'test@example.com', senha: 'senha123',
  }), { headers: { 'Content-Type': 'application/json' } });
  check(res, { '200': (r) => r.status === 200 });
}
```

```bash
k6 run load-test.js
```

## 3. Gargalos comuns em NestJS

### 3.1 Banco de dados — causa #1

| Sintoma | Causa provável | Ação |
|---------|---------------|------|
| `p95` alto em listagem | `SELECT *` + N+1 | `select` específico + `include` planejado |
| `prisma.x.findMany` lento | Falta índice | Adicionar `@@index` no schema + migration |
| Timeouts intermitentes | Pool saturado | Ajustar `connection_limit` |
| `PrismaService` bloqueia event loop | Query em loop síncrono | `Promise.all` |

Detalhamento em `prisma-query-optimization`.

### 3.2 Event loop bloqueado

**Causas comuns**:
- `bcrypt.compare` na rota HTTP (100-300ms cada)
- `JSON.parse` de payload gigante
- Loops síncronos grandes
- `crypto` síncrono

**Mitigação**:

```typescript
// ❌ bcrypt na thread do event loop
async login(@Body() dto: LoginUsuarioDto) {
  return bcrypt.compare(dto.senha, user.senha); // bloqueia
}

// ✅ Worker pool ou argon2 (nativo)
async login(@Body() dto: LoginUsuarioDto) {
  return this.passwordHasher.compare(dto.senha, user.senha);
}
// PasswordHasher usa bcrypt — considerar argon2 ou worker pool
```

**No projeto**: o `BcryptPasswordHasherService` faz `bcrypt.compare` na
thread do event loop. Em 100 RPS isso é gargalo. **Recomendação**:
migrar para `argon2id` (nativo, mais rápido).

### 3.3 N+1 queries

```typescript
// ❌ N+1
const empresas = await this.empresaRepo.findAll();
for (const e of empresas) {
  e.perfis = await this.perfilRepo.findByEmpresa(e.id);
}

// ✅ Prisma include resolve em 1 query
const empresas = await this.prisma.empresa.findMany({
  include: { perfis: { select: { id: true, nome: true } } },
});
```

**Detector**:

```typescript
// Se você ver um for com await dentro, é N+1 em 90% dos casos
for (const x of items) {
  await this.repo.findByX(x.id); // ← suspeito
}
```

### 3.4 Logging verboso

```typescript
// Em prod: 'info' (não 'debug')
pinoHttp: { level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' }
```

**No projeto**: já está correto em `main.ts`. Atenção a logs em loops.

### 3.5 Memória

- **Vazamentos**: subscriptions não canceladas, listeners vivos, caches sem TTL
- **Heap grande**: estruturas que crescem

**Diagnóstico**:

```bash
node --inspect dist/main   # Chrome DevTools → Memory → Heap snapshot
```

**No projeto**: `LoginHistory` e `AuditLog` crescem indefinidamente.
**Ação**: job de retenção (BullMQ agendado, ex.: apagar > 90 dias).

### 3.6 Caches mal desenhados

- Sem TTL → dados velhos
- TTL muito curto → cache miss constante
- Thundering herd (muitos batem no DB ao expirar)
- Cache de valores que mudam sempre

Detalhamento em `redis-bullmq-caching`.

## 4. Estratégias (do mais barato ao mais caro)

| Estratégia | Custo | Quando |
|------------|-------|--------|
| Remover N+1 | Baixo | Sempre que houver loop com query |
| Adicionar índice | Baixo | Query lenta com WHERE/ORDER BY |
| Cache de leitura | Médio | Read-heavy, tolera staleness |
| Paginação cursor | Médio | Listas grandes |
| Compressão gzip/br | Baixo | Response > 1 KB |
| HTTP/2 + keep-alive | Médio | Múltiplas requests/cliente |
| Worker pool (bcrypt, image) | Médio | CPU-bound na rota |
| Read replicas | Alto | Sobrecarga de leitura |
| Sharding | Muito alto | Volume massivo |
| Service worker / cron | Médio | Tarefas pesadas fora do request |
| BullMQ assíncrono | Médio | Trabalho demorado diferível |

## 5. Decisão de cache (4 pontos)

| Pergunta | Se sim → cache |
|----------|---------------|
| Read-heavy? (> 10:1) | ✓ |
| Tolera staleness? (segundos/minutos) | ✓ |
| Caro de computar? (DB lento, join) | ✓ |
| Não é dado sensível pessoal (LGPD) | ✓ |

**Se 3/4 sim → cache. Se 0-2/4 → não cacheie.**

**No projeto**:
- ✓ Cachear: listagem de perfis, permissões, dados de tenant
- ✗ NÃO cachear: tokens (precisam ser revogados em tempo real)
- ✗ NÃO cachear: dados pessoais sensíveis (LGPD)

## 6. Padrão Cache-Aside

```typescript
@Injectable()
export class CacheAsideService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async getOrLoad<T>(
    key: string,
    loader: () => Promise<T | null>,
    ttl: number = 600,
  ): Promise<T | null> {
    const cached = await this.cache.get<T>(key);
    if (cached !== undefined && cached !== null) return cached;
    const fresh = await loader();
    if (fresh !== null && fresh !== undefined) {
      await this.cache.set(key, fresh, ttl);
    }
    return fresh;
  }

  async invalidate(...keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.cache.del(k)));
  }
}
```

**Uso**:

```typescript
async findById(id: number) {
  return this.cacheAside.getOrLoad(
    `usuario:${id}`,
    () => this.userRepo.findById(id),
    600, // 10 min
  );
}

async update(id: number, data: UpdateUsuarioDto) {
  const user = await this.userRepo.update(id, data);
  await this.cacheAside.invalidate(`usuario:${id}`);
  return user;
}
```

**Invalidação por write**: sempre `cache.del` após `update`/`delete`.

## 7. Paginação

| Tipo | Como | Quando |
|------|------|--------|
| **Offset** | `skip: 20, take: 10` | UI com "página 1, 2, 3" |
| **Cursor** | `cursor: { id: 100 }, take: 10` | Feed infinito, dados que mudam |
| **Keyset** | `WHERE id > 1000` | Performance crítica |

**No projeto**: `PaginationDto` usa offset — OK para `Usuario`, `Empresa`.
**Recomendação**: cursor para `AuditLog` e `LoginHistory` (crescem sem limite).

## 8. Network — alavancas

| Alavanca | Quando | Implementação |
|----------|--------|---------------|
| Compressão (`Content-Encoding: br`) | Response > 1 KB | `@fastify/compress` |
| HTTP keep-alive | Sempre (default) | já on |
| HTTP/2 multiplexing | Múltiplas requests/cliente | depende do LB |
| CDN | Assets estáticos | fora da API |
| `ETag` / `Cache-Control` | Recursos versionados | headers HTTP |
| Streaming (Fastify) | Resposta grande (relatórios) | `reply.send(stream)` |

**No projeto**: **falta** `@fastify/compress`. Adicionar.

## 9. Connection Pool — dimensionamento

### Prisma → Postgres

```bash
# Default: num_physical_cpus * 2 + 1 (4 vCPUs = 9 conexões)
DATABASE_URL="postgresql://...?connection_limit=10&pool_timeout=20"
```

```text
max_connections no Postgres >= num_instancias × connection_limit + reservas
```

Exemplo: 4 instâncias × 9 = 36 + 10 admin = 46 → configurar `max_connections = 100`.

## 10. Performance Budget — disciplina

```typescript
// RNF no design.md
// REQ-AUTH-N01 [SHALL] Login SHALL responder em p95 ≤ 200ms.

// Teste de aceitação (em CI)
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

## 11. Profiling — roteiro prático

```text
1. Identificar endpoint lento (via APM/metrics)
   └─ Ex: GET /usuarios p95 = 800ms (RNF diz 200ms)

2. Capturar trace (Jaeger) da request lenta
   └─ Ver qual span é o gargalo (DB? CPU? I/O?)

3. Se DB:
   a. EXPLAIN ANALYZE da query → ver se usa índice
   b. SELECT * vs SELECT específico → reduzir colunas
   c. N+1 → reescrever com JOIN planejado
   d. Adicionar índice se WHERE/ORDER BY sem índice
   e. Cache de leitura se read-heavy

4. Se CPU (event loop bloqueado):
   a. clinic flame para ver a função cara
   b. Worker pool ou algoritmo mais leve
   c. argon2 em vez de bcrypt

5. Se memória:
   a. Heap snapshot
   b. Procurar objetos crescendo
   c. Adicionar TTL em cache
   d. Job de retenção para tabelas históricas

6. Medir de novo (k6 ou artillery)
   └─ Atingiu o RNF? Manter. Não atingiu? Reverter e tentar de novo.
```

## 12. Anti-padrões a vigiar

| ❌ Anti | ✅ Correto |
|---------|-----------|
| Otimizar sem medir | Profile + medir antes |
| Cache de tudo | 4 pontos de decisão |
| `await` em loop síncrono | `Promise.all` |
| `findMany` sem `select` | `select` específico |
| `findMany` sem `take` | Sempre paginar |
| `bcrypt` na thread do event loop | Worker pool ou argon2 |
| `console.log` em hot path | Pino com level apropriado |
| Conexão DB por request | Pool |
| Query em loop | JOIN planejado + `include` |
| Otimizar micro (1ns) | Foco no macro (ms) |

## 13. Reference

- [`.agent/docs/08-performance-otimizacao-apis-nestjs.md`](../../docs/08-performance-otimizacao-apis-nestjs.md) — completo
- [`.agent/skills/prisma-query-optimization/SKILL.md`](../prisma-query-optimization/SKILL.md) — query tuning
- [`.agent/skills/redis-bullmq-caching/SKILL.md`](../redis-bullmq-caching/SKILL.md) — cache
- [`.agent/skills/opentelemetry-tracing/SKILL.md`](../opentelemetry-tracing/SKILL.md) — tracing
- Brendan Gregg — *Systems Performance* (2020)
- Node.js — [Performance](https://nodejs.org/en/docs/guides/simple-profiling)
- `clinic.js` — [clinicjs.org](https://clinicjs.org/)
- k6 — [k6.io](https://k6.io/)
- [AGENTS.md §9 — Infra e Observabilidade](../../../AGENTS.md#9-infra-e-observabilidade)
