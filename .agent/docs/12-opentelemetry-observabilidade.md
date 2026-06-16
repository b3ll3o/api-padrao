---
title: Observabilidade OpenTelemetry em NestJS
description: Tracing, métricas, logs, RED/USE/SLI/SLO, propagação, instrumentação
last_updated: 2026-06-15
reviewer: analista-backend
related:
  - 08-performance-otimizacao-apis-nestjs.md
  - 10-fastify-nestjs-best-practices.md
  - 11-redis-bullmq-cache-best-practices.md
  - ../../AGENTS.md
---

# Observabilidade OpenTelemetry em NestJS

> Documento de referência sobre **OpenTelemetry (OTel)** aplicado ao
> NestJS 11 do projeto `api-padrao`. Foco: tracing, métricas, logs,
> correlação, propagação entre serviços, e o pipeline **OTel Collector →
> Jaeger** já configurado.

## 1. O que o projeto tem hoje

```text
src/tracing.ts                              ← SDK init (linha 1 de main.ts)
src/main.ts (linha 1)                       ← import './tracing' ANTES do Nest
otel-collector-config.yaml                  ← collector: OTLP in → Jaeger out
docker-compose.yml: otel-collector + jaeger
package.json:
  @opentelemetry/api
  @opentelemetry/sdk-node
  @opentelemetry/auto-instrumentations-node
  @opentelemetry/instrumentation-nestjs-core
  @opentelemetry/exporter-trace-otlp-http
.env:
  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
  OTEL_SERVICE_NAME=api-padrao
```

**Pipeline atual**:

```text
NestJS app
  └─ OTel SDK (auto-instrumentation)
       └─ OTLP HTTP exporter
            └─ OTEL Collector (porta 4318)
                 └─ Jaeger exporter (gRPC)
                      └─ Jaeger UI (porta 16686)
```

## 2. Os 3 pilares da observabilidade

| Pilar | O que é | Ferramenta no projeto |
|-------|---------|----------------------|
| **Logs** | Eventos discretos (request chegou, job completou) | `nestjs-pino` (JSON estruturado) |
| **Metrics** | Números agregados (CPU, latência, throughput) | (a implementar) — `prom-client` |
| **Traces** | Caminho de uma request entre componentes | OpenTelemetry → Jaeger |

**Regra de ouro**: correlacione os três com **traceId** e **spanId** (que
o OTel injeta em logs e exports).

## 3. Tracing — OpenTelemetry

### 3.1 Conceitos

- **Trace**: árvore de spans que representa uma operação fim-a-fim (ex.: "POST /auth/login")
- **Span**: unidade de trabalho (uma chamada HTTP, uma query DB, uma chamada Redis)
- **Context**: propagação entre spans (traceId, spanId, baggage)
- **Propagator**: padrão de headers (`traceparent`, `tracestate` — W3C)

### 3.2 O que é auto-instrumentado

O `auto-instrumentations-node` captura **sem código**:

- `http` (incoming + outgoing)
- `express` / `fastify`
- `nestjs-core` (controllers, providers)
- `prisma` (queries)
- `ioredis` (comandos)
- `bullmq` (jobs)
- `pg` (queries Postgres)
- `dns`, `net`, `tls` (low-level)

**Ativação**: `@opentelemetry/auto-instrumentations-node` registra tudo
automaticamente. Customizações via env vars.

### 3.3 Custom spans (código manual)

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

**Quando usar custom span**:
- Operação de **negócio** (não apenas I/O) que você quer medir
- Adicionar **atributos de negócio** (userId, empresaId, status custom)
- Marcar **etapas** de um fluxo complexo (ex.: "etapa 1: validar; etapa 2: provisionar")

## 4. Propagação entre serviços

Quando uma chamada sai do app (HTTP para API externa, mensagem para
fila), o OTel injeta o header `traceparent`:

```http
traceparent: 00-<traceId>-<spanId>-01
```

**No receptor**: o auto-instrumentation lê o header e cria o span como
**filho** do trace original. Isso permite rastrear **um request entre N
serviços**.

**Implicação para o projeto**:
- Chamadas HTTP com `@nestjs/axios` já propagam
- Filas BullMQ: a propagação **não** é automática — precisa customizar
  (`opentelemetry-instrumentation-bullmq` ou manual)
- Traces de Job (worker) aparecem no Jaeger como **filhos** do span
  que adicionou o job

## 5. Sampling — não traçar tudo

Em prod, traçar 100% das requests = custo alto. **Sampling** decide quais
traces manter.

| Estratégia | Quando | Custo |
|------------|--------|-------|
| **Always On** | Dev, testes | 100% |
| **Always Off** | Carga muito alta, ou "aceitável perder" | 0% |
| **Probabilistic** | 1-10% das requests | Reduzido |
| **ParentBased** | Segue decisão do upstream | Compatível com propagação |
| **Tail-based** | Decidir **depois** (no collector) | Mais flexível, mais infra |
| **Error/Always** | Erros + 1% do resto | 99% de economia, 100% dos erros |

**Recomendação para o projeto**:

```typescript
// src/tracing.ts
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node';

const sampler = process.env.NODE_ENV === 'production'
  ? new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(0.1) }) // 10% em prod
  : new AlwaysOnSampler();
```

**Atenção**: garantir que **erros sempre sejam traçados**. O
`ParentBasedSampler` com override "AlwaysOn em erros" é o ideal.

## 6. Métricas — implementação sugerida

O projeto tem **tracing**, mas **não** tem métricas Prometheus. Recomendação:

```bash
npm install @willsoto/nestjs-prometheus prom-client
```

```typescript
// src/shared/infrastructure/metrics/metrics.module.ts
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true }, // CPU, memória, GC, event loop
    }),
  ],
  providers: [HttpMetricsInterceptor],
})
export class MetricsModule {}

// src/shared/infrastructure/metrics/http-metrics.interceptor.ts
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
        this.counter.inc({ method: req.method, status: '2xx' });
      }),
      catchError((err) => {
        this.counter.inc({ method: req.method, status: '5xx' });
        throw err;
      }),
    );
  }
}
```

**Endpoint**: `GET /metrics` (formato Prometheus) — proteja com auth ou
firewall.

## 7. RED, USE, SLI/SLO — métricas que importam

### 7.1 RED (Request, Error, Duration) — para serviços

| Métrica | O que medir | Como |
|---------|-------------|------|
| **Rate** | RPS | `http_requests_total` |
| **Errors** | Taxa de 5xx | `http_requests_total{status=~"5.."}` |
| **Duration** | p50, p95, p99 | `http_request_duration_seconds` |

### 7.2 USE (Utilization, Saturation, Errors) — para recursos

| Métrica | O que medir |
|---------|-------------|
| **Utilization** | % de uso de CPU, memória, disco, conexões |
| **Saturation** | Fila (event loop lag, request queue, DB pool) |
| **Errors** | Taxa de erros do recurso |

### 7.3 SLI/SLO — para confiabilidade

- **SLI** (Service Level Indicator): métrica (ex.: "latência p95")
- **SLO** (Service Level Objective): alvo (ex.: "p95 < 200ms por 99% do mês")
- **Error budget**: (1 - SLO) × tempo = quanto tempo pode quebrar

**Exemplo de SLO para o projeto**:

```text
REQ-AUTH-N01 [SHALL] Login SHALL responder em p95 ≤ 200ms com disponibilidade ≥ 99.9%.
SLI: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="api-padrao",route="/auth/login"}[28d])) by (le))
SLO: < 0.200
Error budget mensal: 43min 12s de downtime
```

## 8. Logs estruturados — correlação com traces

O `nestjs-pino` aceita hooks para incluir `traceId`/`spanId` em **todo log**.

```typescript
// src/shared/infrastructure/logging/pino-trace-correlation.ts
import { trace, context } from '@opentelemetry/api';

export function injectTraceContext(logObj: any) {
  const span = trace.getSpan(context.active());
  if (span) {
    const ctx = span.spanContext();
    logObj.traceId = ctx.traceId;
    logObj.spanId = ctx.spanId;
  }
  return logObj;
}
```

**Pino** (via `mixin`):

```typescript
LoggerModule.forRoot({
  pinoHttp: {
    level: 'info',
    mixin: () => {
      const span = trace.getSpan(context.active());
      return span ? { traceId: span.spanContext().traceId, spanId: span.spanContext().spanId } : {};
    },
  },
});
```

**No Jaeger**: clique num trace → veja os logs do mesmo `traceId` no
Loki/Elasticsearch.

## 9. Alertas — Sentry/Datadog/Grafana

| Sinal | Alvo |
|-------|------|
| **Error rate > 1%** (5min) | PagerDuty → on-call |
| **Latência p95 > 500ms** (5min) | Slack |
| **CPU > 85%** (10min) | Slack |
| **Memory RSS > 200MB** | Slack |
| **DB connections > 80%** | Slack |
| **Circuit breaker OPEN** | Slack |
| **Job failed > 10%** | Slack |

**Implementação**: no `app.module.ts`, exportar métricas e o collector
do Prometheus scrape. Grafana lê e dispara alertas.

## 10. OpenTelemetry Collector — o que está configurado

```yaml
# otel-collector-config.yaml (resumo)
receivers:
  otlp:
    protocols:
      http: { endpoint: 0.0.0.0:4318 }
      grpc: { endpoint: 0.0.0.0:4317 }
processors:
  batch: {}           # agrupa spans antes de exportar
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
- Adicionar `memory_limiter` processor (evita OOM do collector)
- Adicionar `tail_sampling` (decide amostragem no collector — mais flexível)
- Adicionar `resourcedetection` (enriquece spans com metadata do host)
- Exportar **métricas** para Prometheus (futuro)

## 11. Adoção de logging estruturado

**Hoje**:
- `nestjs-pino` (estruturado JSON em prod, pretty em dev)
- `LoggingInterceptor` (log de request/response)
- Logs em services (`this.logger.log/warn/error`)

**Boas práticas**:
- **Sempre** estruturado: `this.logger.log({ userId, empresaId }, 'mensagem')` em vez de `this.logger.log('mensagem' + userId)`
- **Nunca** logar dados sensíveis (senha, token, CPF completo)
- **Incluir** `traceId`/`spanId` (mixin do pino)
- **Níveis**: `error` (precisa ação), `warn` (atenção), `info` (evento), `debug` (dev), `trace` (muito verboso)

```typescript
// ❌ String concatenation, sem contexto
this.logger.log('Usuário ' + userId + ' fez login');

// ✅ Estruturado, com contexto
this.logger.log({ userId, ip, userAgent, duracaoMs: 42 }, 'login.success');
```

## 12. Estratégia de instrumentação (resumo)

| Camada | O que instrumentar | Como |
|--------|-------------------|------|
| **HTTP** | Latência, status code, route | Auto + interceptor custom |
| **DB (Prisma)** | Query time, query text (truncado) | Auto |
| **Cache (Redis)** | Hit/miss, latency | Auto + atributos custom |
| **Fila (BullMQ)** | Job duration, retries, status | Auto (instrumentation-bullmq) |
| **Auth** | Login success/fail, token issue | Custom span com attrs |
| **Business** | "Criar usuário", "Revogar token" | Custom span + log |

## 13. Anti-padrões de observabilidade

| ❌ Anti | ✅ Correto |
|---------|-----------|
| Loggar `console.log('entrou')` sem contexto | `logger.log({userId, action}, 'descrição')` |
| Não correlacionar logs com traces | `traceId` em **toda** linha |
| Métricas sem labels | Labels em alta cardinalidade são caras (use `route`, `method`, `status`) |
| Alertas em **toda** anomalia | Alertas **acionáveis** (com runbook) |
| Tracing 100% em prod | Sampling (10% + 100% erros) |
| Dashboard sem dono | Todo dashboard tem owner + on-call |
| Métrica sem **por que** medir | Cada métrica responde uma pergunta de negócio |

## 14. Roadmap sugerido

1. **Curto prazo** (já temos)
   - ✓ Tracing (OTel → Jaeger)
   - ✓ Logs estruturados (pino)
   - ✓ Auto-instrumentation
2. **Médio prazo**
   - [ ] Adicionar `prom-client` + endpoint `/metrics`
   - [ ] Grafana dashboard (RED + USE)
   - [ ] Sampling configurável (10% prod)
   - [ ] Correlação traceId em logs (mixin)
3. **Longo prazo**
   - [ ] Tracing distribuído (se microserviço)
   - [ ] Tail sampling no collector
   - [ ] Alerts acionáveis (PagerDuty)
   - [ ] SLO por módulo

## 15. Referências

- OpenTelemetry — [opentelemetry.io/docs](https://opentelemetry.io/docs/)
- OTel JS SDK — [opentelemetry.io/docs/languages/js](https://opentelemetry.io/docs/languages/js/)
- Jaeger Docs — [jaegertracing.io/docs](https://www.jaegertracing.io/docs/)
- Prometheus — [prometheus.io/docs](https://prometheus.io/docs/)
- Google SRE Book — [sre.google/sre-book](https://sre.google/sre-book/) — SLO/error budget
- Alex Hidalgo — *Implementing Service Level Objectives* (2020)
- Brendan Gregg — *Observability Engineering* (2022) — OTel, RED, USE
- [.agent/docs/10-fastify-nestjs-best-practices.md](./10-fastify-nestjs-best-practices.md)
- [AGENTS.md §9 — Infra e Observabilidade](../../AGENTS.md#9-infra-e-observabilidade)
- [src/tracing.ts](../../src/tracing.ts)
- [otel-collector-config.yaml](../../otel-collector-config.yaml)
