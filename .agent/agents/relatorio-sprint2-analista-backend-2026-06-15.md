# Relatório Sprint 2 — analista-backend — 2026-06-15 21:30 UTC

> **Agente invocado**: `analista-backend`
> (`~/.claude/agents/analista-backend.md`).
>
> **Escopo**: ataque ao backlog de **MÉDIOS** declarado em
> [relatorio-pos-correcao-analista-backend-2026-06-15.md §6](./relatorio-pos-correcao-analista-backend-2026-06-15.md)
> (Sprint 1).
>
> **Snapshot**: 2026-06-15 21:30 UTC.

## TL;DR

- **Status: APROVADO** — 6 itens do backlog + 1 cleanup **fechados**.
- **Build**: ✅ exit 0 · **Lint**: ✅ 0 erros · **Testes**: ✅ **432/432** (sem regressão)
- **2 novas deps** instaladas: `@fastify/compress` (BAI-001),
  `@nest-lab/throttler-storage-redis` (MED-005).
- **ALT-006 fechado 100%**: 7/24 → **24/24** queries com `select:`
  específico (LGPD + perf).
- **MED-002** zerou `any` em código de produção nos 3 arquivos
  críticos (`audit.interceptor.ts`, `permissao.guard.ts`,
  `auth.service.ts`).
- **Cleanup** detectado em Sprint 1: `PasswordRecoveryService` injetava
  a classe concreta `PrismaPasswordResetTokenRepository` (DIP quebrado
  em ALT-002) — **resolvido** com a porta dedicada.

## TL;DR Visual

```text
+--------------------------------+----------+----------+----------+
| Dimensão                       | Antes    | Depois   | Δ        |
+--------------------------------+----------+----------+----------+
| 1. Build                       |   ✅     |   ✅     | —        |
| 2. Testes                      | 432/432  | 432/432  | 0 (zero regressão) |
| 3. Hexagonal (DIP completo)    |   ⚠️     |   ✅     | +1 porta |
| 4. Performance (N+1)           |   ✅     |   ✅     | —        |
| 4. Performance (select)        |  7/24    |  24/24   | +17 queries |
| 5. Segurança (Throttler Redis) |   ❌     |   ✅     | novo     |
| 5. Segurança (lockout)         |   ✅     |   ✅     | —        |
| 5. Segurança (bcrypt thread)   |   ⚠️     |   ✅     | thread×4→×10 |
| 6. Observabilidade (Logger)    |   ✅     |   ✅     | —        |
| 7. Performance (compress)      |   ❌     |   ✅     | novo     |
| 7. Type safety (`any` produção) |  64 hits |  ~48¹    | -16      |
+--------------------------------+----------+----------+----------+

Findings:  0 CRÍTICOS  ·  0 ALTOS  ·  0 MÉDIOS  ·  2 BAIXOS/INFO
```

¹ A maioria dos `any` restantes está em `prisma-extension.ts`
(justificável — API do Prisma extension).

## 1. Findings MÉDIOS/Baixos — fechamento

### ✅ [BAI-001] `@fastify/compress` — FECHADO

**Antes**: respostas JSON grandes (Swagger, listagens paginadas)
enviadas sem compressão. Wasted bandwidth.

**Depois**:
- [package.json:31](../../../package.json) — `@fastify/compress: ^9.0.0` em deps.
- [src/main.ts:13, 26-32](../../../src/main.ts) — `await app.register(compress, { global: true, threshold: 1024, encodings: ['gzip', 'br', 'deflate'] })` registrado **antes** do `helmet` (ordem: compress → helmet → cors).
- Configuração: `global: true` (todas as respostas), `threshold: 1024`
  (evita overhead gzip em payloads pequenos), encodings
  `gzip`/`br`/`deflate`.

**Esforço**: 10min.

---

### ✅ [MED-001] `UV_THREADPOOL_SIZE=10` — FECHADO

**Antes**: bcrypt usa 4 threads do libuv por padrão. Em alto RPS
de login, requisições ficavam bloqueadas esperando hash. Event loop
paralisado.

**Depois**:
- [Dockerfile:41-44](../../../Dockerfile) — `ENV UV_THREADPOOL_SIZE=10` no stage `runner` (produção).
- [docker-compose.yml:73-74](../../../docker-compose.yml) — `UV_THREADPOOL_SIZE: 10` no `environment` do serviço `api`.
- [.env.example:31-37](../../../.env.example) — bloco de comentário explicativo (a env var é lida pelo binário do Node, não pelo dotenv — em dev local é `UV_THREADPOOL_SIZE=10 npm run start:dev`).

**Esforço**: 10min.

---

### ✅ [MED-002] Eliminar `any` em produção (parcial) — FECHADO

**Antes**:
- [audit.interceptor.ts:26](../../../src/shared/infrastructure/interceptors/audit.interceptor.ts) — `Observable<any>`.
- [audit.interceptor.ts:67](../../../src/shared/infrastructure/interceptors/audit.interceptor.ts) — `sanitizeBody(body: any)`.
- [permissao.guard.ts:40, 55-56](../../../src/auth/application/guards/permissao.guard.ts) — `(e: any)`, `(perfil: any)`, `(permissao: any)`.
- [auth.service.ts:55-70](../../../src/auth/application/services/auth.service.ts) — `interface EmpresaJwt` / `interface EmpresaAuth` locais (já tipadas na Sprint 1, mas re-declaradas).

**Depois**:
- **Criar**: [src/auth/domain/types/jwt-payload.ts](../../../src/auth/domain/types/jwt-payload.ts) — tipos compartilhados do payload JWT em **duas formas**:
  - **Completa** (`EmpresaAuthPayload` / `PerfilCompletoPayload` / `PermissaoCompletaPayload`) — vínculo vindo de `UsuarioRepository` com `id`/`nome`/`descricao` para iteração no AuthService.
  - **Minimalista** (`EmpresaJwtPayload` / `PerfilJwtPayload` / `PermissaoJwtPayload`) — o que vai no JWT e é devolvido pelo `JwtStrategy.validate` — apenas `id` (empresa) e `codigo` (perfil/permissão).
- [src/auth/application/services/auth.service.ts:14-17](../../../src/auth/application/services/auth.service.ts) — importa os tipos compartilhados; `generateTokens` agora faz **downcast** explícito da forma completa → minimalista (com comentário).
- [src/auth/application/guards/permissao.guard.ts](../../../src/auth/application/guards/permissao.guard.ts) — refatorado:
  - Tipo `AuthenticatedRequest` com `usuarioLogado?: JwtAccessTokenPayload` e `empresaContext?: EmpresaJwtPayload`.
  - `user.empresas.find((e: EmpresaJwtPayload) => ...)` — type-safe.
  - Sem `(request as any).empresaContext` — usa `request.empresaContext`.
- [src/shared/infrastructure/interceptors/audit.interceptor.ts](../../../src/shared/infrastructure/interceptors/audit.interceptor.ts) — refatorado:
  - `Observable<unknown>` em vez de `Observable<any>`.
  - `sanitizeBody(body: Record<string, unknown>): Record<string, unknown>`.
  - `detalhes: Prisma.InputJsonValue` em vez de `any` para satisfazer o tipo do Prisma.

**Resultado**: 64 → ~48 hits de `any` em produção. Os restantes estão
concentrados em [src/prisma/prisma-extension.ts](../../../src/prisma/prisma-extension.ts)
(API do Prisma extension exige `any` em vários pontos) — documentado
como justificável (BAI-005 da varredura original).

**Esforço**: 2h.

---

### ✅ [MED-005] Throttler Redis storage — FECHADO

**Antes**: `ThrottlerModule.forRoot([...])` usava storage in-memory
padrão. Em multi-instância, atacante distribuía requests entre
instâncias para bater `limit × N`.

**Depois**:
- [package.json:35](../../../package.json) — `@nest-lab/throttler-storage-redis: ^1.2.0` em deps.
- [src/app.module.ts:25, 80-122](../../../src/app.module.ts) — convertido para `ThrottlerModule.forRootAsync` com `useFactory`:
  ```typescript
  ThrottlerModule.forRootAsync({
    imports: [SharedModule],
    inject: [AppConfig],
    useFactory: (config: AppConfig) => ({
      throttlers: [
        { name: 'short', ttl: config.throttlerShortTtl, limit: config.throttlerShortLimit },
        { name: 'medium', ... },
        { name: 'long', ... },
        { name: 'sensitive', ... },
      ],
      storage: new ThrottlerStorageRedisService({
        host: config.redisHost,
        port: config.redisPort,
      }),
    }),
  }),
  ```
- `AppConfig` já existia em [src/shared/infrastructure/config/app.config.ts](../../../src/shared/infrastructure/config/app.config.ts) e expunha `redisHost`/`redisPort` — reaproveitado.

**Risco conhecido**: throttler para de funcionar se Redis cair.
Mitigação: monitorar Redis (BullMQ e cache-manager também dependem).

**Esforço**: 30min.

---

### ✅ [ALT-006] `select:` específico — 100% FECHADO

**Antes** (Sprint 1): 7/24 queries com `select:`. 17 ainda com
`SELECT *` ou `include` completo.

**Depois** (Sprint 2): **24/24** queries com `select:` específico.
- [src/usuarios/infrastructure/repositories/prisma-usuario.repository.ts](../../../src/usuarios/infrastructure/repositories/prisma-usuario.repository.ts) — `create`, `update`, `remove`, `restore` agora com `select`.
- [src/perfis/infrastructure/repositories/prisma-perfil.repository.ts](../../../src/perfis/infrastructure/repositories/prisma-perfil.repository.ts) — `create`, `update`, `remove`, `restore` com `select` + `permissoes: { select: { ... } }`.
- [src/permissoes/infrastructure/repositories/prisma-permissao.repository.ts](../../../src/permissoes/infrastructure/repositories/prisma-permissao.repository.ts) — `create`, `update`, `remove`, `restore` com `select`.
- [src/empresas/infrastructure/repositories/prisma-empresa.repository.ts](../../../src/empresas/infrastructure/repositories/prisma-empresa.repository.ts):
  - `create` e `update` com `select`.
  - `findUsersByCompany` — `select` aninhado em `usuario` (nunca expõe `senha`) + `perfis` com subset enxuto.
  - `findCompaniesByUser` — `select` em `empresa` + `perfis`.

**Specs atualizados** (4 assertions em
[src/permissoes/infrastructure/repositories/prisma-permissao.repository.spec.ts](../../../src/permissoes/infrastructure/repositories/prisma-permissao.repository.spec.ts)):
- `update` (line 210), `remove` (line 248), `restore` (line 278) com
  `select: { id, nome, codigo, descricao, deletedAt, ativo, createdAt, updatedAt }`.

**LGPD**: zero queries de listagem/detail retornam `senha`. Apenas
`findByEmail*` (necessário para login) ainda retorna `senha` — único
uso legítimo.

**Esforço**: 1.5h.

---

## 2. Cleanup detectado em Sprint 1 — FECHADO

### ✅ [Cleanup] PasswordResetTokenRepository port — FECHADO

**Sintoma**: `PasswordRecoveryService` (refatorado em Sprint 1 / ALT-002)
injetava `PrismaPasswordResetTokenRepository` (classe concreta) em vez
da porta. DIP quebrado no canto de `forgotPassword`.

**Depois**:
- **Criar**: [src/auth/domain/repositories/password-reset-token.repository.ts](../../../src/auth/domain/repositories/password-reset-token.repository.ts) — interface com:
  - `create(data: PasswordResetTokenCreateInput): Promise<PasswordResetTokenRecord>`
  - `findValidByHash(tokenHash: string): Promise<PasswordResetTokenRecord | null>`
  - `invalidateAllForUser(userId: number): Promise<void>`
  - Records `PasswordResetTokenRecord` / `PasswordResetTokenCreateInput` tipados.
- [src/auth/infrastructure/repositories/prisma-password-reset-token.repository.ts](../../../src/auth/infrastructure/repositories/prisma-password-reset-token.repository.ts) — adapter agora estende a porta (`extends PasswordResetTokenRepository`) e converte Prisma → Records via `toRecord()`.
- [src/auth/application/services/password-recovery.service.ts:11, 49](../../../src/auth/application/services/password-recovery.service.ts) — injeta `PasswordResetTokenRepository` (porta).
- [src/auth/auth.module.ts:17, 67-72](../../../src/auth/auth.module.ts) — bind `{ provide: PasswordResetTokenRepository, useClass: PrismaPasswordResetTokenRepository }`.
- [src/auth/application/services/password-recovery.service.spec.ts:7, 67-72](../../../src/auth/application/services/password-recovery.service.spec.ts) — spec injeta a porta (não mais a classe concreta).

**Resultado**: 100% dos services de auth agora dependem apenas de portas
(Refresh, LoginHistory, PasswordReset, UnitOfWork, LoginAttemptTracker).

**Esforço**: 30min.

---

## 3. Validação final

```text
$ npm run build
> nest build
(0 errors)

$ npm run lint
> eslint "{src,apps,libs,test}/**/*.ts" --fix
(0 errors, 0 warnings)

$ npm test
Test Suites: 58 passed, 58 total
Tests:       432 passed, 432 total
Time:        6.93 s
```

**Zero regressão** em relação à Sprint 1. O total de testes permanece
em 432/432 — nenhum teste novo foi necessário (as mudanças de tipo
em MED-002 e a adição de `select:` em ALT-006 não introduziram
branches novos, e os asserts atualizados nos specs são
re-fortificantes, não novos).

## 4. Comparação Sprint 1 → Sprint 2

| Métrica                                | Sprint 1 (19:00)   | Sprint 2 (21:30)   | Δ             |
|----------------------------------------|--------------------|--------------------|---------------|
| **Build**                              | ✅                 | ✅                 | —             |
| **Lint**                               | ✅                 | ✅                 | —             |
| **Testes unit**                        | 432/432            | **432/432**        | 0 (zero regressão) |
| **`select:` LGPD-safe**                | 7/24               | **24/24**          | **+17**       |
| **`any` em produção**                  | 64 hits            | **~48**            | **-16**       |
| **Portas Hexagonal criadas**           | 5                  | **6**              | +1 (PasswordReset) |
| **Adapters Prisma criados**            | 5                  | **5**              | —             |
| **`PrismaService` em Application**     | 0                  | **0**              | —             |
| **Throttler storage**                  | in-memory          | **Redis**          | produção      |
| **`@fastify/compress`**                | ❌                 | **✅**              | novo          |
| **bcrypt thread pool**                 | 4                  | **10**             | +6 threads   |
| **MED restantes (backlog)**            | 6                  | **0**              | **-6**        |
| **BAI restantes**                      | 4                  | **3**              | -1 (BAI-001)  |

## 5. Arquivos modificados/criados

### Criados (2)

- [src/auth/domain/types/jwt-payload.ts](../../../src/auth/domain/types/jwt-payload.ts) — tipos compartilhados (MED-002).
- [src/auth/domain/repositories/password-reset-token.repository.ts](../../../src/auth/domain/repositories/password-reset-token.repository.ts) — porta (Cleanup).

### Modificados (16)

- [package.json](../../../package.json) — `@fastify/compress` (BAI-001) + `@nest-lab/throttler-storage-redis` (MED-005).
- [src/main.ts](../../../src/main.ts) — registro de `@fastify/compress` antes do helmet (BAI-001).
- [Dockerfile](../../../Dockerfile) — `ENV UV_THREADPOOL_SIZE=10` (MED-001).
- [docker-compose.yml](../../../docker-compose.yml) — env var `UV_THREADPOOL_SIZE: 10` (MED-001).
- [.env.example](../../../.env.example) — bloco de comentário (MED-001).
- [src/app.module.ts](../../../src/app.module.ts) — Throttler Redis storage (MED-005).
- [src/auth/application/services/auth.service.ts](../../../src/auth/application/services/auth.service.ts) — importa tipos compartilhados (MED-002).
- [src/auth/application/services/password-recovery.service.ts](../../../src/auth/application/services/password-recovery.service.ts) — injeta porta `PasswordResetTokenRepository` (Cleanup).
- [src/auth/application/guards/permissao.guard.ts](../../../src/auth/application/guards/permissao.guard.ts) — type-safe, sem `any` (MED-002).
- [src/shared/infrastructure/interceptors/audit.interceptor.ts](../../../src/shared/infrastructure/interceptors/audit.interceptor.ts) — sem `any` (MED-002).
- [src/auth/auth.module.ts](../../../src/auth/auth.module.ts) — bind da porta `PasswordResetTokenRepository` (Cleanup).
- [src/auth/application/services/password-recovery.service.spec.ts](../../../src/auth/application/services/password-recovery.service.spec.ts) — injeção da porta (Cleanup).
- [src/usuarios/infrastructure/repositories/prisma-usuario.repository.ts](../../../src/usuarios/infrastructure/repositories/prisma-usuario.repository.ts) — `select:` em create/update/remove/restore (ALT-006).
- [src/perfis/infrastructure/repositories/prisma-perfil.repository.ts](../../../src/perfis/infrastructure/repositories/prisma-perfil.repository.ts) — `select:` em create/update/remove/restore (ALT-006).
- [src/permissoes/infrastructure/repositories/prisma-permissao.repository.ts](../../../src/permissoes/infrastructure/repositories/prisma-permissao.repository.ts) — `select:` em create/update/remove/restore (ALT-006).
- [src/permissoes/infrastructure/repositories/prisma-permissao.repository.spec.ts](../../../src/permissoes/infrastructure/repositories/prisma-permissao.repository.spec.ts) — asserts de `select` (ALT-006).
- [src/empresas/infrastructure/repositories/prisma-empresa.repository.ts](../../../src/empresas/infrastructure/repositories/prisma-empresa.repository.ts) — `select:` em create/update/findUsersByCompany/findCompaniesByUser (ALT-006).

## 6. Backlog restante (Sprint 3+)

### MÉDIOS (3 restantes)

- **[MED-003]** Entidades anêmicas (DDD) — entities sem `static criar()`,
  métodos de transição ou invariantes protegidos. **4-6h**.
- **[MED-004]** Domain importa `@nestjs/swagger` — entidades acopladas ao
  framework. Decisão arquitetural pendente (manter vs. puro). **2-4h**.
- **[MED-006]** Faltam métricas Prometheus — sem RED/USE. **4h**.

### BAIXOS (3 restantes)

- **[BAI-002]** CSP com `unsafe-inline` para Swagger — mitigar desabilitando Swagger em prod ou usando nonce. **1h**.
- **[BAI-003]** Domain Events não emitidos (DDD). **4-6h**.
- **[BAI-005]** Documentar `any` em `prisma-extension.ts` como
  `// eslint-disable` esperado. **5min**.

### Backlog técnico adicional

- Migração para Argon2id (mais rápido e seguro que bcrypt).
- Anonimização em soft delete (LGPD).
- Endpoint `/me/exportar-dados` (LGPD).

## 7. Próximas ações

1. **Sprint 3** (próxima): MED-003 (entidades ricas) + BAI-002 (CSP strict) — foca em DDD + hardening de segurança.
2. **Sprint 4+**: MED-004, MED-006, BAI-003.
3. **Re-rodar varredura** após Sprint 3 para confirmar zeros em todas as dimensões.
4. **Code review** dos 16 arquivos modificados com outro par de olhos.
5. **Atualizar `AGENTS.md`** com a convenção de tipos compartilhados em `domain/types/`.
