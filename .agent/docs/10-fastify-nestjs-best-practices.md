---
title: Best practices Fastify + NestJS 11
description: Plataforma, hooks, schemas, plugins, lifecycle, performance, Fastify vs Express
last_updated: 2026-06-15
reviewer: analista-backend
related:
  - 08-performance-otimizacao-apis-nestjs.md
  - 11-redis-bullmq-cache-best-practices.md
  - 13-seguranca-jwt-oauth-throttler.md
  - ../../AGENTS.md
---

# Best practices Fastify + NestJS 11

> Documento de referência sobre **Fastify** (HTTP server) integrado ao
> **NestJS 11** via `@nestjs/platform-fastify`. Foco: por que Fastify,
> como ele se diferencia de Express, lifecycle, hooks, schemas, plugins,
> e boas práticas aplicadas ao projeto `api-padrao`.

## 1. Por que Fastify no projeto

```text
NestJS 11  ──────►  @nestjs/platform-fastify  ──────►  Fastify 5
                                                              │
                                                              ▼
                                                  Pino (logger nativo)
```

| Critério | Fastify | Express |
|---------|---------|---------|
| Performance | 2-3x mais rápido (req/s) | Baseline |
| Schema validation | Nativa (JSON Schema / Ajv) | Middleware manual |
| Plugin system | `fastify-plugin` (encapsulamento) | `app.use()` global |
| Logger | Pino (nativo) | Morgan / Winston |
| Async/await | First-class | Wrapper legacy |
| Decorators NestJS | Suportados | Suportados (Express é o default) |
| TypeScript | First-class | Tipos community |
| Comunidade | Crescendo | Enorme (legado) |

**No projeto**: já usamos Fastify (ver `main.ts` — `new FastifyAdapter()`).

## 2. Setup no projeto (já está OK)

```typescript
// src/main.ts (essencial)
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
  { bufferLogs: true },
);
```

**Ponto crítico**: `bufferLogs: true` **antes** do `app.useLogger()` para
não perder logs do startup.

## 3. FastifyAdapter — opções

```typescript
new FastifyAdapter({
  logger: false, // usamos o Logger do nestjs-pino
  bodyLimit: 1048576, // 1MB (default é 1MB)
  trustProxy: true, // respeita X-Forwarded-For (atrás de proxy)
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId',
  genReqId: () => crypto.randomUUID(), // ← ou header correlation id
  disableRequestLogging: true, // LoggingInterceptor cuida
  // keepAliveTimeout: 5_000, // ← tuning se necessário
});
```

**No projeto**: vale considerar `trustProxy: true` (atrás de Docker/proxy
em prod) e `genReqId` (para correlação de logs).

## 4. Plugins Fastify — usar com sabedoria

### 4.1 Já temos

- `@fastify/helmet` — HTTP security headers
- `@fastify/static` — servir arquivos estáticos
- (sugestão) `@fastify/compress` — gzip/brotli
- (sugestão) `@fastify/cors` — mais rápido que o CORS do Nest

### 4.2 Como registrar plugin

```typescript
// No main.ts (dentro do NestFactory context)
const app = await NestFactory.create<NestFastifyApplication>(...);
await app.register(helmet, { contentSecurityPolicy: { ... } });
```

### 4.3 Encapsulamento

Fastify cria **contexto** por plugin (a partir do v3). Para o plugin
"vazar" para o app inteiro, encapsule com `fastify-plugin`:

```typescript
import fp from 'fastify-plugin';
export default fp(async (fastify) => { ... });
```

**No projeto**: a maioria dos plugins é registrada no `main.ts` no escopo
do app inteiro — OK.

## 5. Hooks Fastify (lifecycle)

```text
onRequest       → antes do routing
preParsing      → antes do body parse
preValidation   → antes da validação
preHandler      → antes do handler
preSerialization → antes da serialização
onSend          → antes de enviar
onResponse      → depois de enviar
onError         → em caso de erro
```

**Quando usar cada um**:
- `onRequest` — rate limiting, autenticação, request ID
- `preHandler` — lógica contextual, carregar dados
- `onSend` — adicionar headers, compress
- `onResponse` — métricas, audit

**No NestJS**: prefira **interceptors** Nest em vez de hooks Fastify
puros. Hooks Fastify para coisas **antes** do Nest (ex.: request ID).

## 6. Schemas — JSON Schema nativo

Fastify usa **Ajv** internamente para validação. Você pode validar o
body sem `class-validator`:

```typescript
app.post('/example', {
  schema: {
    body: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', maxLength: 255 },
        age: { type: 'integer', minimum: 0 },
      },
    },
  },
}, handler);
```

**No projeto**: usamos `class-validator` + DTOs. **Decisão consciente**:
validação por classe (mais expressivo, decorators). Fastify schema é
**alternativa** se a performance for crítica.

## 7. Serialização — performance

```typescript
// Fastify usa fast-json-stringify (compile-time schema → stringifier)
// Ganho de 2-5x sobre JSON.stringify padrão

app.get('/users', {
  schema: {
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'integer' }, email: { type: 'string' } },
        },
      },
    },
  },
}, handler);
```

**Implicação**: o Fastify serializa **muito mais rápido** que Express
porque gera a função de stringificação em build time. **Não confie**
em `JSON.stringify` em hot path — use schemas.

## 8. Decorators NestJS — funcionam normalmente

```typescript
// src/auth/application/controllers/auth.controller.ts
@Controller('auth')
export class AuthController {
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Public()
  async login(@Body() dto: LoginUsuarioDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }
}
```

**Tudo isso funciona** com `@nestjs/platform-fastify`. Decorators do
Nest são abstraídos sobre o Fastify.

## 9. Logger — nestjs-pino (já temos)

```typescript
// src/app.module.ts
LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
  },
});
```

**Pino**:
- 5x mais rápido que Winston/Morgan
- Saída JSON estruturada (pronto para ingestão por Datadog/Loki/ELK)
- `pino-pretty` em dev (legível), JSON em prod (parseável)

**Boas práticas**:
- `level: 'info'` em prod (não 'debug')
- **Não** loggar dados sensíveis (senha, token, CPF)
- Usar **contexto** (`Logger` do Nest aceita nome da classe automaticamente)

## 10. Lifecycle do Nest + Fastify

```text
NestFactory.create()            ──── bootstrap
  └─ Fastify instance           ──── FastifyAdapter
       └─ Module init
            └─ onModuleInit      ──── providers (PrismaService, etc.)
                 └─ listen()    ──── Fastify listen na porta
                      └─ onRequest → auth guard → handler → onResponse
```

**Pontos críticos**:
- `onModuleInit` do `PrismaService` (chama `$connect()`) — antes de
  aceitar requests.
- `tracing.ts` é importado **antes** de tudo (linha 1 de `main.ts`) para
  instrumentar o OpenTelemetry **antes** do Nest iniciar.

## 11. Validação global — `ValidationPipe`

```typescript
// src/main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,             // remove props não declaradas no DTO
    forbidNonWhitelisted: true,  // lança erro se vier prop a mais
    transform: true,             // converte para o tipo do DTO
  }),
);
```

**No projeto**: já está configurado **corretamente**. **Verificar** que
**todo DTO novo** usa `class-validator`.

## 12. Interceptors Nest (em vez de hooks Fastify)

```typescript
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const t0 = Date.now();
    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - t0;
        // log estruturado
      }),
    );
  }
}
```

**Já temos**:
- `ClassSerializerInterceptor` — aplica `@Exclude()` (padrão Nest)
- `LoggingInterceptor` — log de request
- `EmpresaInterceptor` — popula `EmpresaContext`
- `AuditInterceptor` — `@Audit('ação')` no controller

**No projeto**: ver `src/app.module.ts` §providers — todos globais.

## 13. Guards Nest (em vez de middleware Fastify)

```typescript
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Observable<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    // ...
  }
}
```

**No projeto**: ordem global: `ThrottlerGuard` → `AuthGuard` → `PermissaoGuard`.

**Padrão recomendado**: use `guards` Nest, **não** middleware Fastify.
Motivo: guards têm acesso ao **DI container** do Nest.

## 14. CORS — já configurado (mas revisar)

```typescript
// main.ts
app.enableCors({
  origin: isProduction
    ? configService.get<string>('ALLOWED_ORIGINS')?.split(',') || false
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-empresa-id', 'x-request-id'],
});
```

**Verificar**:
- `ALLOWED_ORIGINS` em prod é **CSV** (ex.: `https://app.com,https://admin.app.com`).
- `credentials: true` permite cookies — **risco de CSRF** se não usar SameSite.
- `OPTIONS` é importante para preflight.

**Alternativa mais performática**:
```typescript
await app.register(cors, { origin: ['https://app.com'], credentials: true });
```

## 15. Helmet — já configurado (revisar CSP)

```typescript
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: [`'self'`],
      styleSrc: [`'self'`, `'unsafe-inline'`],     // ← Swagger precisa
      imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
      scriptSrc: [`'self'`, `https: 'unsafe-inline'`], // ← Swagger
    },
  },
});
```

**Atenção**: `'unsafe-inline'` para `style` e `script` é **necessário para
Swagger**. Em produção real, **avaliar** se o Swagger está exposto
(`/swagger`). **Recomendação**: desabilitar Swagger em prod, ou proteger
com autenticação.

## 16. Compression (sugestão)

```bash
npm install @fastify/compress
```

```typescript
// main.ts
await app.register(compress, {
  threshold: 1024, // só comprime > 1KB
  encodings: ['gzip', 'br'],
});
```

**Ganho típico**: 60-80% de redução em JSON médio. **Latência da compressão
vs bandwidth**: comprimir JSON > 5KB quase sempre vale a pena.

## 17. Lifecycle do request — debug

Para entender o que está acontecendo em uma request:

```text
1. Client → TCP socket
2. Fastify recebe → emite 'onRequest'
3. NestJS router → bate na rota
4. Guards globais (Throttler, Auth, Permissao)
5. Pipes (Validation)
6. Interceptors (Logging, Empresa, Audit, ClassSerializer)
7. Controller.method()
8. Service / Use case
9. Repository → Prisma
10. Interceptors (transforma resultado)
11. Filters (se exceção)
12. Resposta serializada (fast-json-stringify)
13. LoggingInterceptor (log final)
14. Fastify 'onResponse' (envia TCP)
```

**Onde colocar logging**:
- `LoggingInterceptor` — request completa (entrada + saída)
- Em services — ações de negócio ("criou usuário X")
- `AuditInterceptor` — ações auditáveis (apagar, alterar role, etc.)

## 18. Performance — alavancas

| Alavanca | Impacto | Custo |
|----------|---------|-------|
| `disableRequestLogging: true` + LoggingInterceptor custom | -10% latência | Reuso de spans OTEL |
| `@fastify/compress` | -60% bandwidth | +5ms CPU |
| Schemas de response (fast-json-stringify) | -30% latência serialização | Curva de aprendizado |
| `keepAliveTimeout` ajustado | Throughput | Edge cases |
| `bodyLimit` baixo (1MB) | Segurança + memória | Limita uploads |
| `trustProxy: true` | IP correto atrás de proxy | Cuidado com spoofing |

## 19. Anti-padrões a vigiar

| ❌ Anti | ✅ Correto |
|---------|-----------|
| `console.log` em service | `this.logger.log(...)` (pino) |
| Lançar erro no controller sem tipar | Tipar (`NotFoundException`, etc.) |
| Middleware Express (`req, res, next`) | Interceptor / Guard Nest |
| Validação no controller (if/else) | `class-validator` no DTO |
| Schema Fastify + DTO ao mesmo tempo | Escolher **um** (preferir DTO Nest) |
| `JSON.stringify` em hot path | Schema de response (fast-json-stringify) |
| Bloquear event loop com `setTimeout`/`bcrypt` síncrono | Worker pool / argon2 |

## 20. Referências

- Fastify Docs — [fastify.io/docs/latest/](https://fastify.io/docs/latest/)
- NestJS Docs — Platform Fastify — [docs.nestjs.com/techniques/performance](https://docs.nestjs.com/techniques/performance)
- Pino Logger — [getpino.io](https://getpino.io/)
- Pino-HTTP — [github.com/pinojs/pino-http](https://github.com/pinojs/pino-http)
- Ajv (JSON Schema) — [ajv.js.org](https://ajv.js.org/)
- fast-json-stringify — [github.com/fastify/fast-json-stringify](https://github.com/fastify/fast-json-stringify)
- [.agent/docs/08-performance-otimizacao-apis-nestjs.md](./08-performance-otimizacao-apis-nestjs.md)
- [.agent/docs/11-redis-bullmq-cache-best-practices.md](./11-redis-bullmq-cache-best-practices.md)
- [AGENTS.md §5 — Convenções](../../AGENTS.md#5-convenções)
- [src/main.ts](../../src/main.ts)
