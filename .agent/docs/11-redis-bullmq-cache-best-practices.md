---
title: Best practices Redis + BullMQ + cache-manager
description: Cache, filas, TTL, invalidação, padrões cache-aside, write-through, padrões BullMQ
last_updated: 2026-06-15
reviewer: analista-backend
related:
  - 08-performance-otimizacao-apis-nestjs.md
  - 10-fastify-nestjs-best-practices.md
  - ../../AGENTS.md
---

# Best practices Redis + BullMQ + cache-manager no NestJS

> Documento de referência sobre **Redis 7** (cache + filas), **BullMQ**
> (filas robustas), e `cache-manager-redis-yet` no projeto `api-padrao`.
> Foco: padrões de cache, invalidação, jobs assíncronos, anti-padrões
> e como o `app.module.ts` já está configurado.

## 1. O que o projeto já tem

```text
app.module.ts:
  CacheModule.registerAsync (global)  → cache-manager-redis-yet
  BullModule.forRootAsync              → BullMQ (fila)
src/shared/infrastructure/services/   → wrappers específicos (a criar)
src/.../                              → @InjectQueue para producers
```

- **Cache global** via `@nestjs/cache-manager` + `cache-manager-redis-yet`
- **Filas** via `@nestjs/bullmq` + `bullmq` (Producer/Consumer)
- **Redis 7** rodando em Docker (porta 6379)

## 2. Cache — conceitos

### 2.1 Quando cachear (4 pontos)

| Pergunta | Se sim → cache |
|----------|---------------|
| **Read-heavy?** (> 10:1 read:write) | ✓ |
| **Tolera staleness?** (segundos/minutos) | ✓ |
| **Caro de computar?** (DB query lento, join pesado) | ✓ |
| **Não é dado sensível pessoal** (LGPD) | ✓ |

Se 3/4 sim → cache. Se 0-2/4 → não cacheie.

### 2.2 Padrões de cache

| Padrão | Como | Trade-off |
|--------|------|-----------|
| **Cache-Aside** (lazy) | App lê cache → se miss, busca no DB → popula cache | Padrão mais comum; tolera cache miss |
| **Read-Through** | Cache **sempre** lê do DB ao perder | Acopla cache ao DB |
| **Write-Through** | App escreve no DB **e** no cache ao mesmo tempo | Consistência forte; mais latência |
| **Write-Behind** (write-back) | App escreve só no cache; cache escreve no DB depois | Rápido; risco de perda |
| **Refresh-Ahead** | Cache atualiza antes de expirar | Bom para dados quentes |

**Recomendação para o projeto**: **Cache-Aside** para 90% dos casos. É
simples, lazy, e tolera falhas de cache.

### 2.3 Implementação Cache-Aside

```typescript
// src/shared/infrastructure/services/cache-aside.service.ts
@Injectable()
export class CacheAsideService {
  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private readonly logger: Logger,
  ) {}

  async getOrLoad<T>(
    key: string,
    loader: () => Promise<T | null>,
    ttl: number = 600,
  ): Promise<T | null> {
    const cached = await this.cache.get<T>(key);
    if (cached !== undefined && cached !== null) {
      return cached; // ← HIT
    }
    // ← MISS
    const fresh = await loader();
    if (fresh !== null && fresh !== undefined) {
      await this.cache.set(key, fresh, ttl);
    }
    return fresh;
  }

  async invalidate(...keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.cache.del(k)));
  }

  async invalidateByPattern(pattern: string): Promise<void> {
    // cache-manager-redis-yet expõe o client; usar SCAN + DEL
  }
}
```

**Uso no repository** (Hexagonal-friendly):

```typescript
async findById(id: number): Promise<Usuario | null> {
  return this.cacheAside.getOrLoad(
    `usuario:${id}`,
    () => this.userRepo.findById(id),  // porta do domain
    600, // 10 min
  );
}

async update(id: number, data: UpdateUsuarioDto): Promise<Usuario> {
  const user = await this.userRepo.update(id, data);
  await this.cacheAside.invalidate(`usuario:${id}`);
  return user;
}
```

## 3. Invalidação — o problema difícil

> *"There are only two hard things in Computer Science: cache invalidation
> and naming things."* — Phil Karlton

### 3.1 Estratégias

| Estratégia | Como | Risco |
|------------|------|-------|
| **TTL** | Cache expira após X segundos | Stale dentro do TTL |
| **Invalidate on write** | `del` ao escrever | Janela curta de stale |
| **Versionamento** | `key: v1`, `key: v2` | Invalida tudo de uma vez |
| **Tag-based** | Cache guarda tags; invalida por tag | Complexidade |
| **Pub/Sub** | Worker escuta eventos de invalidação | Latência na propagação |

**Recomendação para o projeto**: combinar **TTL** (limite de segurança) +
**invalidate on write** (consistência forte quando possível).

### 3.2 Exemplo: cache de Perfil

```typescript
// ao atualizar perfil
async update(id: number, data: UpdatePerfilDto) {
  const perfil = await this.perfilRepo.update(id, data);
  await this.cache.del(`perfil:${id}`);
  await this.cache.del(`perfil:empresa:${perfil.empresaId}:all`); // lista
  return perfil;
}
```

**Padrão**: chaves hierárquicas (`entidade:id`, `entidade:empresa:X:all`).
Facilita invalidação por prefixo.

### 3.3 Thundering herd

Quando o cache expira e **muitas** requests batem ao mesmo tempo, todas
vão ao DB. Mitigações:

- **Lock distribuído** (Redis SETNX): 1 request vai ao DB, outros esperam
- **Stale-while-revalidate**: serve o cache velho enquanto recarrega
- **Jitter no TTL**: TTL = base + random(0..20%) → expiração espalhada

```typescript
const jitteredTtl = ttl + Math.floor(Math.random() * ttl * 0.2);
await this.cache.set(key, value, jitteredTtl);
```

## 4. BullMQ — filas robustas

### 4.1 Quando usar

- Trabalho que **não precisa** ser feito no request HTTP (email, export, sync)
- Trabalho que pode **falhar e ser retentado**
- Trabalho que precisa de **agendamento** (cron, delay)
- Trabalho que precisa de **controle de concorrência**

### 4.2 Conceitos

| Conceito | O que é |
|----------|---------|
| **Queue** | Fila nomeada (ex.: `email-queue`) |
| **Job** | Unidade de trabalho na fila |
| **Producer** | Quem adiciona jobs (service Nest) |
| **Consumer/Worker** | Quem processa jobs (Processor Nest) |
| **Repeatable Job** | Cron / a cada N segundos |
| **Delayed Job** | Rodar depois de X ms |
| **Priority** | Job mais prioritário roda antes |
| **Attempts** | Retry automático com backoff |
| **Backoff** | Tempo entre retries (exponential) |

### 4.3 Setup no projeto

```typescript
// src/<módulo>/<módulo>.module.ts
@Module({
  imports: [
    BullModule.registerQueue({ name: 'email' }),
  ],
  providers: [EmailProcessor],
})
export class EmailModule {}

// src/<módulo>/infrastructure/queues/email.processor.ts
@Processor('email')
export class EmailProcessor extends WorkerHost {
  constructor(private mailer: Mailer) { super(); }

  @Process('send')
  async send(job: Job<{ to: string; subject: string; body: string }>) {
    this.logger.log(`Processando job ${job.id}`);
    await this.mailer.send(job.data);
    return { sent: true, at: new Date() };
  }
}

// src/<módulo>/application/services/email.service.ts
@Injectable()
export class EmailService {
  constructor(@InjectQueue('email') private queue: Queue) {}

  async sendWelcome(to: string) {
    await this.queue.add('send', { to, subject: 'Bem-vindo', body: '...' }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
```

### 4.4 Idempotência — crucial

Jobs podem rodar **mais de uma vez** (retry). O processador deve ser
**idempotente**:

```typescript
// ❌ Não idempotente — pode duplicar email
async send(job) {
  await this.mailer.send(job.data);
}

// ✅ Idempotente — verifica se já enviou
async send(job) {
  const dedupeKey = `email:sent:${job.data.to}:${job.data.subject}`;
  const sent = await this.cache.get(dedupeKey);
  if (sent) return { skipped: true };
  await this.mailer.send(job.data);
  await this.cache.set(dedupeKey, true, 86400); // 24h
}
```

**Alternativa**: usar `jobId` único no `add` (BullMQ dedupe):

```typescript
await this.queue.add('send', data, { jobId: `email:${userId}:${timestamp}` });
```

### 4.5 Concorrência e rate limit por job

```typescript
@Processor('email', { concurrency: 5 }) // 5 jobs paralelos
export class EmailProcessor extends WorkerHost { ... }
```

```typescript
// rate limit por processador (1 job a cada 200ms)
@Process({ name: 'send', concurrency: 1 })
async send(job: Job) {
  await new Promise((r) => setTimeout(r, 200));
  // ...
}
```

### 4.6 Delayed & scheduled

```typescript
// Delayed (rodar em 1h)
await this.queue.add('reminder', data, { delay: 3600_000 });

// Repeatable (cron)
await this.queue.add(
  'cleanup',
  {},
  { repeat: { pattern: '0 3 * * *' } }, // todo dia 3h
);
```

## 5. Dashboard e monitoramento

- **Bull Board**: UI para visualizar filas
  - `npm install @bull-board/api @bull-board/express @bull-board/fastify`
  - **Atenção**: proteger com auth (apenas admin)
- **Redis Insight** ou **Redis Commander**: UI genérica do Redis
- **Métricas Prometheus**: BullMQ expõe `bullmq:queue:*`

## 6. Erros comuns

| ❌ Erro | ✅ Correto |
|---------|-----------|
| Job que **não é idempotente** | Use `jobId` único ou dedupe key |
| Timeout de job sem `try/catch` | Sempre `try/catch` + log + atualizar status |
| Job **dentro de transação DB** | Filas são para **depois** da transação |
| `setImmediate` ou `setTimeout` em vez de fila | Use BullMQ — tem retry, monitor, persistência |
| Tentar processar **tudo** em fila | Só trabalho **pesado** ou **assíncrono** |
| Concorrência infinita | Limite `concurrency: 5` por processador |
| Senhas, tokens ou PII no payload do job | Mascarar ou usar ID (buscar no DB) |

## 7. Configuração recomendada para o projeto

```typescript
// app.module.ts (já está global)
CacheModule.registerAsync({
  isGlobal: true,
  useFactory: async (config: AppConfig) => ({
    store: await redisStore({
      socket: { host: config.redisHost, port: config.redisPort },
      ttl: config.cacheTtl, // default 600s
    }),
  }),
}),
BullModule.forRootAsync({
  useFactory: (config: AppConfig) => ({
    connection: {
      host: config.redisHost,
      port: config.redisPort,
      // Sugestões:
      maxRetriesPerRequest: null, // BullMQ requer null
      enableReadyCheck: false,
    },
  }),
}),
```

**Sugestões de melhorias**:
1. **Tornar `maxRetriesPerRequest: null`** — BullMQ precisa
2. **Adicionar `defaultJobOptions`** globais (attempts, backoff, removeOnComplete)
3. **Configurar prefixo de keys** (ex.: `api-padrao:cache:`) para evitar
   colisão com outros apps no mesmo Redis
4. **Habilitar `keyPrefix`** no `cache-manager-redis-yet` se disponível

```typescript
useFactory: () => ({
  connection: { host, port },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800 },
  },
}),
```

## 8. Cache keys — convenção

```text
<app>:<entidade>:<id>                       → api-padrao:usuario:42
<app>:<entidade>:<empresaId>:<id>           → api-padrao:perfil:empresa-aaa:7
<app>:<entidade>:list:<empresaId>:p<page>   → api-padrao:perfil:list:empresa-aaa:p1
<app>:<session>:<userId>:<token>            → api-padrao:session:42:abc123
```

**No projeto**: ainda não há convenção documentada. **Recomendar**
formalizar no `AGENTS.md`.

## 9. Multi-tenancy em cache

Cache **não compartilha** dados entre empresas (é multi-tenant). Sempre
**incluir `empresaId`** na chave:

```typescript
// ✅ Chave inclui empresaId
const key = `perfil:list:${empresaId}:p${page}`;
// ao invalidar: del por prefixo `perfil:list:${empresaId}:*`
```

**Risco**: cache **sem** `empresaId` na chave = vazamento entre tenants.

## 10. Alavancas de performance

| Alavanca | Ganho típico |
|----------|-------------|
| Cache em listagens read-heavy | 5-50x menos queries |
| BullMQ para emails | p95 de email não impacta HTTP |
| TTL de 5-10 min em dados de listagem | Reduz carga do DB |
| Cache de JWT validado (lookup de `revokedAt`) | 10x mais rápido que DB |
| Desnormalização (count de perfis por empresa em cache) | -1 query por listagem |
| Pipeline do Redis (multi-op) | 1 RTT para N comandos |

## 11. Anti-padrões a vigiar

| ❌ Anti | ✅ Correto |
|---------|-----------|
| Cachear **tudo** sem critério | 4 pontos de decisão |
| `cache.set(key, value)` sem TTL | Sempre TTL |
| Chave de cache sem `empresaId` (multi-tenant) | Sempre com scope |
| Job que executa lógica pesada síncrona no HTTP | Enfileirar |
| `setTimeout(fn, 1000)` em vez de `queue.add({ delay: 1000 })` | BullMQ |
| Redis sem senha em prod | `requirepass` + ACL |
| `cache.set` síncrono no hot path | `fire-and-forget` se aceitável |
| `FLUSHDB` em prod | `SCAN` + `DEL` por prefixo |

## 12. Observabilidade

- **`@nestjs/bullmq`** loga eventos (job completed, failed)
- **Jaeger** vê o span do job (com OpenTelemetry)
- **Métricas**: `bull_queue_jobs_completed_total`, `bull_queue_jobs_failed_total`
- **Health check**: incluir `redis.ping()` em `/health/ready`

## 13. Referências

- Redis Docs — [redis.io/docs](https://redis.io/docs/)
- BullMQ Docs — [docs.bullmq.io](https://docs.bullmq.io/)
- cache-manager Docs — [github.com/jaredwray/cache-manager](https://github.com/jaredwray/cache-manager)
- cache-manager-redis-yet — [github.com/node-cache-manager/cache-manager-redis-yet](https://github.com/node-cache-manager/cache-manager-redis-yet)
- Designing Data-Intensive Applications — Martin Kleppmann (cap. sobre cache)
- [.agent/docs/08-performance-otimizacao-apis-nestjs.md](./08-performance-otimizacao-apis-nestjs.md)
- [.agent/docs/10-fastify-nestjs-best-practices.md](./10-fastify-nestjs-best-practices.md)
- [AGENTS.md §2 — Stack](../../AGENTS.md#2-stack)
- [src/app.module.ts](../../src/app.module.ts)
