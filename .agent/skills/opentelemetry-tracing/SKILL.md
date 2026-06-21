---
name: opentelemetry-tracing
description: Use when adding observability to a service, designing custom spans, correlating logs with traces, or choosing sampling strategy — applies OpenTelemetry patterns (tracing, metrics, logs correlation, propagation) to NestJS 11 with Jaeger backend.
last_updated: 2026-06-15
reviewer: analista-backend
---

# OpenTelemetry — Tracing e Observabilidade

Como aplicar **OpenTelemetry (OTel)** em NestJS 11 do projeto `api-padrao`.
Foco: tracing, custom spans, correlação com logs, sampling, e o pipeline
**OTel Collector → Jaeger** já configurado.

## When to Use

Sintomas: "não consigo achar o gargalo", "trace aparece quebrado no Jaeger",
"como adiciono atributo de negócio?", "deveria criar span custom?",
"sampling 100% em prod é muito", "métricas ainda não temos".

**Não** use para: tuning de query (use `prisma-query-optimization`),
profiling geral (use `performance-profiling-nestjs`).

## 1. Pipeline atual

```text
NestJS app
  └─ OTel SDK (auto-instrumentation)
       └─ OTLP HTTP exporter (OTEL_EXPORTER_OTLP_ENDPOINT)
            └─ OTEL Collector (porta 4318)
                 └─ Jaeger exporter (gRPC)
                      └─ Jaeger UI (porta 16686)
```

**Arquivos**:
- `src/tracing.ts` — SDK init (linha 1 de `main.ts`)
- `otel-collector-config.yaml` — collector
- `docker-compose.yml` — `otel-collector` + `jaeger`

## 2. O que é auto-instrumentado

O `auto-instrumentations-node` captura **sem código**:

- `http` (incoming + outgoing)
- `fastify`
- `nestjs-core` (controllers, providers)
- `prisma` (queries)
- `ioredis` (comandos)
- `bullmq` (jobs)
- `pg` (queries Postgres)
- `dns`, `net`, `tls`

**Ativação**: `@opentelemetry/auto-instrumentations-node` registra tudo
automaticamente. Customizações via env vars.

## 3. Custom spans (código manual)

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('api-padrao-auth');

async login(dto: LoginUsuarioDto) {
  return tracer.startActiveSpan('auth.login', async (span) => {
    try {
      span.setAttribute('user.email', dto.email);
      const user = await this.userRepo.findByEmail(dto.email);
      if (!user) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'user not found' });
        throw new UnauthorizedException();
      }
      const valid = await this.hasher.compare(dto.senha, user.senha);
      span.setAttribute('auth.password_match', valid);
      if (!valid) throw new UnauthorizedException();
      return this.issueTokens(user);
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}
```

**Quando usar**:
- Operação de **negócio** (não apenas I/O) que você quer medir
- Adicionar **atributos de negócio** (`userId`, `empresaId`, `status custom`)
- Marcar **etapas** de um fluxo complexo

## 4. Atributos de negócio (sempre com `setAttribute`)

| Categoria | Atributos |
|-----------|-----------|
| **User** | `user.id`, `user.email`, `user.role` |
| **Tenant** | `tenant.id` (= `empresa.id`) |
| **Business** | `order.id`, `payment.amount` |
| **Auth** | `auth.method`, `auth.password_match` |
| **HTTP** | `http.method`, `http.route`, `http.status_code` (auto) |
| **DB** | `db.system`, `db.statement` (auto, truncado) |

**Cuidado**: alta cardinalidade custa (ex.: `user.email` = má ideia; `user.id` = ok).

## 5. Propagação entre serviços

```http
traceparent: 00-<traceId>-<spanId>-01
```

Quando uma chamada sai (HTTP/fila), o OTel injeta `traceparent`. O
receptor cria span **filho** do original.

**Implicações para o projeto**:
- ✓ HTTP (axios) — propagação automática
- ⚠️ BullMQ — propagação **não** é automática; precisa customizar
  (`@opentelemetry/instrumentation-bullmq` ou manual)

## 6. Sampling — não traçar tudo

| Estratégia | Quando | Custo |
|------------|--------|-------|
| **Always On** | Dev, testes | 100% |
| **Always Off** | Carga altíssima, OK perder | 0% |
| **Probabilistic** | 1-10% | Reduzido |
| **ParentBased** | Segue upstream | Compatível |
| **Tail-based** | Decidir no collector | Mais flexível |
| **Error/Always** | Erros + 1% do resto | 99% economia, 100% dos erros |

**Recomendação**:

```typescript
// src/tracing.ts
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node';

const sampler = process.env.NODE_ENV === 'production'
  ? new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(0.1) }) // 10%
  : new AlwaysOnSampler();
```

**Atenção**: garantir que **erros sempre sejam traçados**.

## 7. Correlação trace ↔ logs

Pino + OTel mixin:

```typescript
// src/tracing.ts (após criar SDK)
import pino from 'pino';
import { trace, context } from '@opentelemetry/api';

const logger = pino({
  mixin: () => {
    const span = trace.getSpan(context.active());
    return span
      ? { traceId: span.spanContext().traceId, spanId: span.spanContext().spanId }
      : {};
  },
});
```

**Benefício**: todo log tem `traceId`/`spanId`. No Jaeger, clica no trace
→ vê os logs do mesmo traceId no Loki/Elasticsearch.

## 8. Métricas — implementação sugerida

```bash
npm install @willsoto/nestjs-prometheus prom-client
```

```typescript
// src/shared/infrastructure/metrics/metrics.module.ts
@Module({
  imports: [
    PrometheusModule.register({ defaultMetrics: { enabled: true } }),
  ],
  providers: [HttpMetricsInterceptor],
})
export class MetricsModule {}
```

```typescript
// http-metrics.interceptor.ts
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    private readonly counter: Counter,
    private readonly histogram: Histogram,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    const t0 = process.hrtime.bigint();
    return next.handle().pipe(
      tap(() => {
        const t1 = process.hrtime.bigint();
        const ms = Number(t1 - t0) / 1e6;
        this.histogram.observe(ms, { method: req.method, route: req.routeOptions?.url });
      }),
      catchError((err) => {
        this.counter.inc({ method: req.method, status: '5xx' });
        throw err;
      }),
    );
  }
}
```

**Endpoint**: `GET /metrics` (proteger com auth ou firewall).

## 9. RED, USE, SLI/SLO

### RED (Request, Error, Duration)

| Métrica | Como medir |
|---------|-----------|
| **Rate** | `http_requests_total` (Prometheus) |
| **Errors** | `http_requests_total{status=~"5.."}` |
| **Duration** | `histogram_quantile(0.95, http_request_duration_seconds_bucket)` |

### USE (Utilization, Saturation, Errors)

| Métrica | Como |
|---------|------|
| **Utilization** | CPU %, memória, disco, conexões DB |
| **Saturation** | Event loop lag, fila de request, pool DB |
| **Errors** | Taxa de erros do recurso |

### SLI/SLO

```text
SLI: latency p95
SLO: < 200ms por 99% do mês
Error budget: (1 - 0.99) × 30d = 7h 12min
```

## 10. Logs estruturados

```typescript
// ❌ String concatenation
this.logger.log('Usuário ' + userId + ' fez login');

// ✅ Estruturado
this.logger.log(
  { userId, ip, userAgent, duracaoMs: 42, action: 'login.success' },
  'login.success',
);
```

**Níveis**:
- `error` (precisa ação)
- `warn` (atenção)
- `info` (evento)
- `debug` (dev)
- `trace` (muito verboso)

**Nunca** logar: senhas, tokens, PII completo (LGPD).

## 11. OpenTelemetry Collector

```yaml
# otel-collector-config.yaml (resumo)
receivers:
  otlp:
    protocols:
      http: { endpoint: 0.0.0.0:4318 }
      grpc: { endpoint: 0.0.0.0:4317 }
processors:
  batch: {}
exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls: { insecure: true }
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/jaeger]
```

**Sugestões**:
- Adicionar `memory_limiter` (evita OOM)
- Adicionar `tail_sampling` (decide no collector)
- Adicionar `resourcedetection` (metadata do host)
- Exportar **métricas** para Prometheus

## 12. Alertas (Sentry/Datadog/Grafana)

| Sinal | Alvo |
|-------|------|
| Error rate > 1% (5min) | PagerDuty |
| Latência p95 > 500ms (5min) | Slack |
| CPU > 85% (10min) | Slack |
| Memory RSS > 200MB | Slack |
| DB connections > 80% | Slack |
| Circuit breaker OPEN | Slack |
| Job failed > 10% | Slack |

## 13. Estratégia de instrumentação

| Camada | O que instrumentar | Como |
|--------|-------------------|------|
| **HTTP** | Latência, status, route | Auto + interceptor custom |
| **DB (Prisma)** | Query time, statement (truncado) | Auto |
| **Cache (Redis)** | Hit/miss, latency | Auto + atributo custom |
| **Fila (BullMQ)** | Job duration, retries, status | Auto |
| **Auth** | Login success/fail, token issue | Custom span + attrs |
| **Business** | "Criar usuário", "Revogar token" | Custom span + log |

## 14. Anti-padrões

| ❌ Anti | ✅ Correto |
|---------|-----------|
| `console.log` sem contexto | `logger.log({...}, 'msg')` |
| Sem correlação trace/log | `traceId` em **toda** linha |
| Métricas sem labels | Labels (cuidado com alta cardinalidade) |
| Alertas em toda anomalia | Alertas **acionáveis** (com runbook) |
| Tracing 100% em prod | Sampling (10% + 100% erros) |
| Dashboard sem dono | Todo dashboard tem owner + on-call |
| Métrica sem "por que medir" | Cada métrica responde uma pergunta |

## 15. Roadmap

1. **Já temos** (verificar)
   - [x] Tracing (OTel → Jaeger)
   - [x] Logs estruturados (pino)
   - [x] Auto-instrumentation
2. **Curto prazo**
   - [ ] `prom-client` + endpoint `/metrics`
   - [ ] Grafana (RED + USE)
   - [ ] Sampling configurável (10% prod)
   - [ ] Correlação `traceId` em logs (mixin)
3. **Longo prazo**
   - [ ] Tracing distribuído (se microserviço)
   - [ ] Tail sampling no collector
   - [ ] Alerts acionáveis (PagerDuty)
   - [ ] SLO por módulo

## 16. Reference

- [`.agent/docs/12-opentelemetry-observabilidade.md`](../../docs/12-opentelemetry-observabilidade.md) — completo
- [`.agent/skills/performance-profiling-nestjs/SKILL.md`](../performance-profiling-nestjs/SKILL.md) — onde aplicar
- OpenTelemetry — [opentelemetry.io/docs](https://opentelemetry.io/docs/)
- Jaeger — [jaegertracing.io/docs](https://www.jaegertracing.io/docs/)
- Prometheus — [prometheus.io/docs](https://prometheus.io/docs/)
- Brendan Gregg — *Observability Engineering* (2022)
- [AGENTS.md §9 — Infra e Observabilidade](../../../AGENTS.md#9-infra-e-observabilidade)
- [src/tracing.ts](../../../src/tracing.ts)
- [otel-collector-config.yaml](../../../otel-collector-config.yaml)
