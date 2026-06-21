---
name: redis-bullmq-caching
description: Use when designing cache strategies, building async jobs, configuring BullMQ queues, or deciding when to cache vs hit the database — applies Redis 7 + cache-manager + BullMQ patterns (cache-aside, invalidation, idempotency) to NestJS 11.
last_updated: 2026-06-15
reviewer: analista-backend
---

# Redis + BullMQ + Cache — Padrões no NestJS

Como aplicar **cache** (cache-aside, invalidação, TTL) e **filas**
(BullMQ, jobs idempotentes) no projeto `api-padrao`. Use quando for
**decidir se cacheia**, **criar uma fila**, ou **investigar inconsistência
de cache**.

## When to Use

Sintomas: "deveria cachear?", "qual TTL?", "job está rodando 2x",
"cache stale", "thundering herd", "fila perdeu mensagem", "como
invalido?", "qual o limite do Redis?"

**Não** use para: tuning de query Prisma (use `prisma-query-optimization`),
profiling de latência (use `performance-profiling-nestjs`).

## 1. Decisão de cache (4 pontos)

| Pergunta | Se sim → cache |
|----------|---------------|
| Read-heavy? (> 10:1 read:write) | ✓ |
| Tolera staleness? (segundos/minutos) | ✓ |
| Caro de computar? (DB lento, join) | ✓ |
| Não é dado sensível pessoal (LGPD) | ✓ |

**3/4 sim → cache. 0-2/4 → não cacheie.**

## 2. Padrão Cache-Aside (recomendado)

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

**Uso no repository**:

```typescript
async findById(id: number) {
  return this.cacheAside.getOrLoad(
    `usuario:${id}`,
    () => this.userRepo.findById(id),
    600,
  );
}

async update(id: number, data: UpdateUsuarioDto) {
  const user = await this.userRepo.update(id, data);
  await this.cacheAside.invalidate(`usuario:${id}`);
  return user;
}
```

**Regra de ouro**: **toda escrita invalida o cache**.

## 3. Padrões (resumo)

| Padrão | Como | Trade-off |
|--------|------|-----------|
| **Cache-Aside** (lazy) | App lê cache → se miss, busca no DB | Padrão; tolera cache miss |
| **Read-Through** | Cache sempre lê do DB ao perder | Acopla cache ao DB |
| **Write-Through** | Escreve no DB **e** no cache | Consistência forte |
| **Write-Behind** | Escreve só no cache; cache escreve no DB depois | Rápido; risco de perda |
| **Refresh-Ahead** | Cache atualiza antes de expirar | Bom para dados quentes |

**Recomendação**: **Cache-Aside** para 90% dos casos.

## 4. Invalidação

| Estratégia | Risco |
|------------|-------|
| **TTL** | Stale dentro do TTL |
| **Invalidate on write** | Janela curta de stale |
| **Versionamento** (`v1`, `v2`) | Invalida tudo |
| **Tag-based** | Complexidade |
| **Pub/Sub** | Latência na propagação |

**Recomendação**: **TTL** (limite) + **invalidate on write** (consistência).

### Cache keys — convenção

```text
<app>:<entidade>:<id>                  → api-padrao:usuario:42
<app>:<entidade>:<empresaId>:<id>      → api-padrao:perfil:empresa-aaa:7
<app>:<entidade>:list:<empresaId>:p<n> → api-padrao:perfil:list:empresa-aaa:p1
```

**No projeto**: ainda não há convenção formal. **Recomendar** incluir no AGENTS.md.

### Multi-tenancy em cache

```typescript
// ✅ Chave inclui empresaId
const key = `perfil:list:${empresaId}:p${page}`;

// ❌ Chave sem empresaId = vazamento entre tenants
const key = `perfis:page${page}`;
```

## 5. Anti-padrões de cache

| ❌ Anti | ✅ Correto |
|---------|-----------|
| Cachear **tudo** | 4 pontos de decisão |
| `cache.set` sem TTL | Sempre TTL |
| Chave sem `empresaId` (multi-tenant) | Sempre com scope |
| Ler do cache antes de validar auth | Validar auth primeiro |
| Cachear tokens | Não (precisam revogar em tempo real) |
| Cachear dados sensíveis (LGPD) | Não |

## 6. Thundering herd

Quando o cache expira e **muitas** requests batem ao mesmo tempo, todas
vão ao DB. Mitigações:

- **Lock distribuído** (Redis SETNX): 1 request vai ao DB, outros esperam
- **Stale-while-revalidate**: serve cache velho enquanto recarrega
- **Jitter no TTL**: TTL = base + random(0..20%)

```typescript
const jitteredTtl = ttl + Math.floor(Math.random() * ttl * 0.2);
await this.cache.set(key, value, jitteredTtl);
```

## 7. BullMQ — filas

### Quando usar

- Trabalho **pesado** que não precisa estar no request HTTP
- Trabalho que pode **falhar e ser retentado**
- Trabalho **agendado** (cron, delay)
- Trabalho que precisa de **controle de concorrência**

### Setup

```typescript
// src/email/email.module.ts
@Module({
  imports: [BullModule.registerQueue({ name: 'email' })],
  providers: [EmailProcessor],
})
export class EmailModule {}
```

```typescript
// src/email/infrastructure/queues/email.processor.ts
@Processor('email', { concurrency: 5 })
export class EmailProcessor extends WorkerHost {
  constructor(private mailer: Mailer, private logger: Logger) { super(); }

  @Process('send')
  async send(job: Job<{ to: string; subject: string; body: string }>) {
    this.logger.log(`Processando job ${job.id}`);
    try {
      await this.mailer.send(job.data);
      return { sent: true, at: new Date() };
    } catch (e) {
      this.logger.error({ err: e, jobId: job.id }, 'Falha ao enviar email');
      throw e;  // BullMQ faz retry
    }
  }
}
```

```typescript
// src/email/application/services/email.service.ts
@Injectable()
export class EmailService {
  constructor(@InjectQueue('email') private queue: Queue) {}

  async sendWelcome(to: string) {
    await this.queue.add(
      'send',
      { to, subject: 'Bem-vindo', body: '...' },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
        jobId: `welcome:${to}`,  // dedupe
      },
    );
  }
}
```

## 8. Idempotência — crucial

Jobs podem rodar **mais de uma vez** (retry). O processador deve ser
**idempotente**.

```typescript
// ❌ Não idempotente — pode duplicar
async send(job) {
  await this.mailer.send(job.data);
}

// ✅ Idempotente — verifica se já enviou
async send(job) {
  const dedupeKey = `email:sent:${job.data.to}:${job.data.subject}`;
  const sent = await this.cache.get(dedupeKey);
  if (sent) return { skipped: true };
  await this.mailer.send(job.data);
  await this.cache.set(dedupeKey, true, 86400);
}

// ✅ Alternativa: jobId único
await this.queue.add('send', data, { jobId: `email:${userId}:${ts}` });
```

## 9. Concorrência e rate limit

```typescript
@Processor('email', { concurrency: 5 }) // 5 jobs paralelos

@Process({ name: 'send', concurrency: 1 })
async send(job: Job) {
  // rate limit: 1 job por vez
  await new Promise((r) => setTimeout(r, 200));
  // ...
}
```

## 10. Delayed & scheduled

```typescript
// Delayed (rodar em 1h)
await this.queue.add('reminder', data, { delay: 3600_000 });

// Repeatable (cron)
await this.queue.add(
  'cleanup',
  {},
  { repeat: { pattern: '0 3 * * *' } }, // 3h todo dia
);
```

## 11. Erros comuns

| ❌ Anti | ✅ Correto |
|---------|-----------|
| Job não-idempotente | `jobId` ou dedupe key |
| Timeout sem `try/catch` | `try/catch` + log + throw |
| Job **dentro** de transação DB | Fila é **depois** da transação |
| `setImmediate` em vez de fila | BullMQ (retry, monitor, persistência) |
| Tentar processar **tudo** em fila | Só pesado/assíncrono |
| Concorrência infinita | `concurrency: 5` por processador |
| Senha/token no payload do job | Mascarar ou usar ID |
| Job sem backoff | `backoff: { type: 'exponential' }` |
| `removeOnFail: true` | `removeOnFail: false` (manter para debug) |

## 12. Configuração recomendada

```typescript
// app.module.ts (BullModule)
useFactory: (config: AppConfig) => ({
  connection: {
    host: config.redisHost,
    port: config.redisPort,
    maxRetriesPerRequest: null,  // BullMQ REQUER null
    enableReadyCheck: false,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800 },
  },
}),
```

**Sugestões**:
- `maxRetriesPerRequest: null` — **obrigatório** para BullMQ
- `keyPrefix` — para evitar colisão com outros apps no mesmo Redis
- `defaultJobOptions` globais — consistência

## 13. Throttler — em Redis (multi-instância)

O Throttler do projeto está **in-memory** (não escala). Para multi-instância:

```typescript
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

ThrottlerModule.forRootAsync({
  inject: [AppConfig],
  useFactory: (config: AppConfig) => ({
    throttlers: [/* ... 4 tiers ... */],
    storage: new ThrottlerStorageRedisService({
      host: config.redisHost,
      port: config.redisPort,
    }),
  }),
}),
```

## 14. Alavancas de performance

| Alavanca | Ganho típico |
|----------|-------------|
| Cache em listagens read-heavy | 5-50x menos queries |
| BullMQ para emails | p95 do email fora do HTTP |
| TTL de 5-10 min em listagem | Reduz carga do DB |
| Cache de JWT validado (revokedAt) | 10x mais rápido que DB |
| Pipeline Redis (multi-op) | 1 RTT para N comandos |

## 15. Monitoramento

- **Bull Board**: UI para visualizar filas
  ```bash
  npm install @bull-board/api @bull-board/express @bull-board/fastify
  # proteger com auth
  ```
- **Métricas**: `bull_queue_jobs_completed_total`, `bull_queue_jobs_failed_total`
- **Health check**: `redis.ping()` em `/health/ready`
- **OpenTelemetry**: `instrumentation-bullmq` (auto-instrumentation)

## 16. Anti-padrões a vigiar

| ❌ Anti | ✅ Correto |
|---------|-----------|
| Cachear **tudo** | 4 pontos |
| `cache.set(key, value)` sem TTL | Sempre TTL |
| Chave sem `empresaId` | Sempre com scope |
| Job que executa trabalho pesado síncrono no HTTP | Enfileirar |
| `setTimeout(fn, 1000)` em vez de `queue.add({ delay: 1000 })` | BullMQ |
| Redis sem senha em prod | `requirepass` + ACL |
| `cache.set` síncrono no hot path | `fire-and-forget` se aceitável |
| `FLUSHDB` em prod | `SCAN` + `DEL` por prefixo |
| Tokens em cache | Não — revogação precisa ser em tempo real |

## 17. Reference

- [`.agent/docs/11-redis-bullmq-cache-best-practices.md`](../../docs/11-redis-bullmq-cache-best-practices.md) — completo
- [`.agent/docs/13-seguranca-jwt-oauth-throttler.md`](../../docs/13-seguranca-jwt-oauth-throttler.md) — auth/cache de sessão
- [`.agent/skills/performance-profiling-nestjs/SKILL.md`](../performance-profiling-nestjs/SKILL.md) — quando cachear
- Redis Docs — [redis.io/docs](https://redis.io/docs/)
- BullMQ — [docs.bullmq.io](https://docs.bullmq.io/)
- cache-manager-redis-yet — [github.com/node-cache-manager/cache-manager-redis-yet](https://github.com/node-cache-manager/cache-manager-redis-yet)
- [AGENTS.md §2 — Stack](../../../AGENTS.md#2-stack)
- [src/app.module.ts](../../../src/app.module.ts)
