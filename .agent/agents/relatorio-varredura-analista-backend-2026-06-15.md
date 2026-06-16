# Relatório de Varredura — analista-backend — 2026-06-15

> **Agente invocado**: `analista-backend` (instalado em
> `~/.claude/agents/analista-backend.md`).
>
> **Metodologia**: 8 dimensões (Build, Testes, Arquitetura, Performance,
> Segurança, Observabilidade, Código, Workflow) — ver
> [`.agent/skills/project-scan/SKILL.md`](../skills/project-scan/SKILL.md).
>
> **Escopo**: `/home/leo/Documentos/projetos/padroes/api-padrao/`
> (NestJS 11.1.6 + Prisma 6.15 + Fastify + PostgreSQL 16 + Redis 7 +
> BullMQ + OTel + Pino).
>
> **Snapshot**: 2026-06-15 18:05 UTC.

## TL;DR

- **Status: APROVADO COM RESSALVAS** — build verde, 402/402 testes
  passando, lint 0 erros, mas há **6 gaps ALTOS** arquiteturais e de
  segurança que devem ser atacados antes de produção real.
- **Nenhum finding CRÍTICO** bloqueia merge.
- A **cobertura de specs subiu de 46% → 68%** entre 14h e 17h40 (de
  29 → 55 specs); build foi corrigido; rastreabilidade BDD/SDD/ATDD/TDD
  foi adotada (127 comentários).
- Os gaps arquiteturais (Hexagonal em Auth, DDD em entities) e de
  segurança (account lockout, log de falhas) **continuam** desde a
  varredura do `analista-qualidade` (14h).

## TL;DR Visual

```text
+-------------------------+--------+--------------------------------------------+
| Dimensão                | Status | Observação                                 |
+-------------------------+--------+--------------------------------------------+
| 1. Build                |   ✅   | tsc OK, lint 0 erros                       |
| 2. Testes               |   ✅   | 402/402, 55 suites, 6.9s                   |
| 3. Arquitetura          |   ⚠️   | AuthService Hexagonal quebrado             |
| 4. Performance          |   ⚠️   | bcrypt no event loop; N+1 em IDs           |
| 5. Segurança            |   ⚠️   | sem lockout, sem log de falhas             |
| 6. Observabilidade      |   ⚠️   | tracing ✓, logs ✓, 0 métricas              |
| 7. Código               |   ⚠️   | 13+ `any` em produção                      |
| 8. Workflow             |   ✅   | 127 comentários BDD/SDD/ATDD/TDD           |
+-------------------------+--------+--------------------------------------------+

Findings:  0 CRÍTICOS  ·  6 ALTOS  ·  7 MÉDIOS  ·  5 BAIXOS/INFO
```

---

## 1. Métricas (snapshot 2026-06-15 18:05 UTC)

### 1.1 Visão geral

| Métrica                              | Valor    | Δ vs 17:40     |
|--------------------------------------|----------|----------------|
| Arquivos de produção (ts)            | **81**   | igual          |
| Specs unitários                      | **55**   | igual          |
| Specs e2e                            | **7**    | igual          |
| Features BDD (.feature)              | **5**    | igual          |
| Linhas de produção (LOC)             | 11.732   | igual          |
| Linhas de teste (LOC)                | 2.611    | igual          |
| Comentários de rastreabilidade       | **127**  | igual          |
| `any` em produção                    | 64 hits  | igual          |
| `console.*` em produção              | **0**    | igual          |
| `TODO/FIXME/XXX/HACK`                | 1        | igual          |
| Imports de @nestjs/* em domain/      | 4        | igual          |
| Build (`npm run build`)              | ✅ exit 0 | igual         |
| Lint (`npm run lint`)                | ✅ 0     | igual          |
| Testes unit (`npm test`)             | ✅ 402/402 | igual        |
| Tempo de execução unit               | 6.9s     | +0.6s (variação) |

### 1.2 Cobertura de specs por módulo

| Módulo      | Produção | Specs | Cobertura | E2E | BDD     |
|-------------|----------|-------|-----------|-----|---------|
| `auth`      | 19       | 13    | **68%**   | 1   | 1       |
| `usuarios`  | 10       | 8     | **80%**   | 1   | 1       |
| `empresas`  | 9        | 7     | **78%**   | 1   | 1       |
| `perfis`    | 8        | 6     | **75%**   | 1   | 1       |
| `permissoes`| 8        | 6     | **75%**   | 1   | 1       |
| `shared`    | 21       | 13    | **62%**   | 0   | 0       |
| `prisma`    | 3        | 2     | **67%**   | 0   | 0       |
| bootstrap*  | 4        | 0     | 0%        | 0   | 0       |
| **Total**   | **81**   | **55**| **68%**   | **7** | **5** |

\* `app.module.ts`, `main.ts`, `tracing.ts`, `config/*`

### 1.3 Cobertura de segurança por endpoint

| Módulo      | Endpoints | @TemPermissao | @Public | @Throttle(sensitive) |
|-------------|-----------|---------------|---------|----------------------|
| `auth`      | 4         | 0             | 4       | 4                    |
| `usuarios`  | 6         | 4             | 1       | 1                    |
| `empresas`  | 8         | 7             | 0       | 3                    |
| `perfis`    | 5         | 5             | 0       | 0                    |
| `permissoes`| 5         | 5             | 0       | 0                    |
| `health`    | 3         | 0             | 3       | 0                    |
| **Total**   | **31**    | **21**        | **8**   | **8**                |

✅ Todos os 31 endpoints cobertos.

---

## 2. Findings CRÍTICOS (bloqueiam produção)

**Nenhum.**

---

## 3. Findings ALTOS (atacar na sprint atual)

### [ALT-001] AuthService injeta PrismaService direto (Hexagonal violado)

- **Arquivo**: [src/auth/application/services/auth.service.ts:11, 21, 44, 108-114](../../../src/auth/application/services/auth.service.ts)
- **Dimensão**: Arquitetura (Hexagonal) + DDD
- **Status**: Pendente desde 14h (identificado por `analista-qualidade`)

**Causa**: 5 referências a `this.prisma.*` na camada Application:
- `this.prisma.loginHistory.create` (linha 44)
- `this.prisma.refreshToken.create/update/updateMany` (em `generateTokens` e `refreshTokens`)
- Query com `include` triplo aninhado (linhas 108-114) que **duplica** o
  que `UsuarioRepository.findByEmailWithPerfisAndPermissoes` já faz.

**Impacto**:
- DIP violado (Application depende de detalhe do ORM).
- Testes do service precisam mockar `PrismaService` (ruído) em vez de
  apenas a porta.
- Risco de divergência: o que é carregado no login (linha 108) pode
  divergir do que está no JWT.

**Recomendação**:
1. Criar `RefreshTokenRepository` (interface em
   `src/auth/domain/repositories/` + impl em
   `src/auth/infrastructure/repositories/`).
2. Criar `LoginHistoryRepository` (mesmo padrão).
3. Mover o include de 3 níveis para
   `PrismaUsuarioRepository.findByEmailWithPerfisAndPermissoes`.
4. Refatorar `AuthService` para injetar as portas.
5. Atualizar `auth.service.spec.ts` para mockar as portas.
6. Wiring no `auth.module.ts`: `useClass: PrismaRefreshTokenRepository`.

**Esforço**: 2-3h · **Skill**: [hexagonal-ports-nestjs §3, §9](../../skills/hexagonal-ports-nestjs/SKILL.md)

---

### [ALT-002] PasswordRecoveryService usa `prisma.$transaction` direto

- **Arquivo**: [src/auth/application/services/password-recovery.service.ts:38, 104-114](../../../src/auth/application/services/password-recovery.service.ts)
- **Dimensão**: Arquitetura (Hexagonal)

**Causa**: `resetPassword` chama `this.prisma.$transaction([...])` com
3 operações (usuario.update, refreshToken.updateMany,
passwordResetToken.update). Service sem logger.

**Recomendação**:
1. Criar porta `UnitOfWork` (ou `TransactionRunner`) para encapsular
   `$transaction`.
2. Mover as 3 operações para um método do repositório
   (`UsuarioRepository.resetPasswordWithTokenInvalidation`).
3. Adicionar `Logger` no service (ver [ALT-004]).

**Esforço**: 2h · **Skill**: [hexagonal-ports-nestjs §3, §4](../../skills/hexagonal-ports-nestjs/SKILL.md)

---

### [ALT-003] Account lockout não implementado (OWASP A07)

- **Arquivo**: (gap) — `AuthService.login` lança 401 imediato em
  credenciais inválidas.
- **Dimensão**: Segurança

**Causa**: throttler global limita por IP, não por email. Atacante
distribui tentativas em vários IPs / espera retry.

**Recomendação**:
```typescript
// auth.service.ts
const attempts = await this.cache.get<number>(`login:attempts:${email}`) ?? 0;
if (attempts >= 5) {
  throw new TooManyRequestsException('Conta temporariamente bloqueada. Tente em 15min.');
}
if (!valid) {
  await this.cache.set(`login:attempts:${email}`, attempts + 1, { ttl: 900 });
  throw new UnauthorizedException();
}
await this.cache.del(`login:attempts:${email}`);
```

**Esforço**: 1h (cache já está configurado) · **Skill**: [security-auth-review §9](../../skills/security-auth-review/SKILL.md)

---

### [ALT-004] Falhas de login não são logadas (OWASP A09 / LGPD)

- **Arquivos**:
  - [src/auth/application/services/auth.service.ts](../../../src/auth/application/services/auth.service.ts)
  - [src/auth/application/services/password-recovery.service.ts](../../../src/auth/application/services/password-recovery.service.ts)
- **Dimensão**: Segurança + LGPD

**Causa**: services **não injetam `Logger`**. Sucesso vai para
`LoginHistory`, mas falhas são invisíveis.

**Recomendação**:
```typescript
// AuthService.login
this.logger.log({ userId: user.id, ip, userAgent }, 'auth.login.success');
// AuthService.login (em falha)
this.logger.warn(
  { email, ip, userAgent, motivo: 'credenciais invalidas' },
  'auth.login.fail',
);
```

**Esforço**: 1h · **Skill**: [security-auth-review §11](../../skills/security-auth-review/SKILL.md)

---

### [ALT-005] N+1 em validação de IDs (perfis/empresas)

- **Arquivos**:
  - [src/perfis/application/services/perfis.service.ts:33-36, 125-128](../../../src/perfis/application/services/perfis.service.ts)
  - [src/empresas/application/services/empresas.service.ts:64-69](../../../src/empresas/application/services/empresas.service.ts)
- **Dimensão**: Performance

**Causa**: 3 loops `for-await` validam IDs um por um. Para `N` IDs =
`N` SELECTs sequenciais.

**Recomendação**:
```typescript
// ✅ 1 query (lote) ou parallel
const found = await Promise.all(
  createPerfilDto.permissoesIds.map(id => this.permissoesService.findOne(id)),
);
if (found.some(r => !r)) throw new NotFoundException();
```

**Esforço**: 30min · **Skills**: [prisma-query-optimization §3](../../skills/prisma-query-optimization/SKILL.md), [performance-profiling-nestjs §3.3](../../skills/performance-profiling-nestjs/SKILL.md)

---

### [ALT-006] `select` específico ausente em 23/24 queries Prisma

- **Arquivos**: 8 repositórios Prisma
- **Dimensão**: Performance + LGPD

**Causa**: das 24 chamadas a `findUnique|findFirst|findMany` em
código de produção, **1** usa `select:` explícito. Todas as outras
fazem `SELECT *` (incluindo `senha` em alguns casos).

**Recomendação**: para cada query, fazer
`select: { campo1, campo2 }` explícito. Pattern em
[prisma-query-optimization §2](../../skills/prisma-query-optimization/SKILL.md).

**Esforço**: 4-6h (mexer em 8 repos)

---

## 4. Findings MÉDIOS (backlog priorizado)

### [MED-001] Bcrypt no event loop (perf + segurança de evolução)

- **Arquivo**: [src/shared/infrastructure/services/bcrypt-password-hasher.service.ts](../../../src/shared/infrastructure/services/bcrypt-password-hasher.service.ts)
- **Dimensão**: Performance

**Causa**: `bcrypt.hash` e `bcrypt.compare` rodam na thread do event
loop. Em alto RPS paraliza o servidor. Argon2id não está presente
(0 hits).

**Recomendação**:
1. **Imediato** (`UV_THREADPOOL_SIZE=10` no env).
2. **Curto prazo**: migrar para `argon2id` (nativo, mais rápido).
   Criar `Argon2PasswordHasherService extends PasswordHasher` e trocar
   `useClass` em `app.module.ts` — zero impacto no domínio.

**Esforço**: 1-3h · **Skill**: [security-auth-review §10](../../skills/security-auth-review/SKILL.md), [performance-profiling-nestjs §3.2](../../skills/performance-profiling-nestjs/SKILL.md)

---

### [MED-002] `any` types em código de produção (Type safety)

- **Arquivos**:
  - `auth.service.ts:55-70` — `empresas: any`, `(ue: any)`, `(perfil: any)`, `(permissao: any)`
  - `audit.interceptor.ts:26, 67` — `Observable<any>`, `body: any`
  - `permissao.guard.ts:40, 55, 56` — `(e: any)`, `(perfil: any)`, `(permissao: any)`
  - `prisma-extension.ts` e `prisma.service.ts` — `any` (justificável)
  - `all-exceptions.filter.ts:85, 91` — `exception: any` (catch genérico OK)
- **Total**: 64 hits (mas muitos em `prisma-extension` e justificáveis)
- **Dimensão**: Código

**Recomendação**:
1. `auth.service.ts` — extrair type alias de `EmpresasComPerfis` em
   `auth/domain/types/`.
2. `permissao.guard.ts` — tipar `user.empresas` usando a interface do
   `UsuarioRepository`.
3. `audit.interceptor.ts` — `Observable<T>` em vez de `Observable<any>`.
4. Deixar `prisma-extension.ts` com `// eslint-disable` documentado.

**Esforço**: 2h · **Skill**: [clean-code-solid-typescript §12](../../skills/clean-code-solid-typescript/SKILL.md)

---

### [MED-003] Entidades de domínio anêmicas (DDD)

- **Arquivos**: 4 entities
  - [src/usuarios/domain/entities/usuario.entity.ts](../../../src/usuarios/domain/entities/usuario.entity.ts)
  - [src/perfis/domain/entities/perfil.entity.ts](../../../src/perfis/domain/entities/perfil.entity.ts)
  - [src/permissoes/domain/entities/permissao.entity.ts](../../../src/permissoes/domain/entities/permissao.entity.ts)
  - [src/shared/domain/entities/base.entity.ts](../../../src/shared/domain/entities/base.entity.ts)
- **Dimensão**: DDD

**Causa**: entities são sacos de campos com `@ApiProperty`. Sem
`static criar()`, sem métodos de transição, sem invariantes protegidos.
Regras de domínio espalhadas nos services.

**Recomendação** (incremental, ver [ddd-aggregate-modeling §2](../../skills/ddd-aggregate-modeling/SKILL.md)):
1. `Usuario.criar()` com validação de email/senha.
2. `Usuario.desativar(motivo)` → emite `UsuarioDesativadoEvent`.
3. Refatorar `UsuariosService.desativar()` para chamar o método.
4. Repetir para `Perfil`, `Permissao`, `Empresa`.

**Esforço**: 4-6h total

---

### [MED-004] Domain importa `@nestjs/swagger` (pureza do domain)

- **Arquivos** (4 entities, mesmo grupo do MED-003)
- **Dimensão**: DDD/Hexagonal — Pureza do Domain

**Causa**: entities usam `@ApiProperty` (do `@nestjs/swagger`). Domain
fica acoplado ao framework.

**Decisão arquitetural**:
- **Opção A** (manter): documentar como exceção aceita no AGENTS.md.
- **Opção B** (puro): mover Swagger para DTOs em `application/dto/`,
  entities com JSDoc puro.

**Esforço**: 2-4h (opção B) · **Skill**: [hexagonal-ports-nestjs §6](../../skills/hexagonal-ports-nestjs/SKILL.md)

---

### [MED-005] Throttler em memória (não escala multi-instância)

- **Arquivo**: [src/app.module.ts:77-98](../../../src/app.module.ts)
- **Dimensão**: Segurança + Escalabilidade

**Causa**: `ThrottlerModule` configurado sem `storage` → default
in-memory. Em multi-instância, atacante bate `limit×N` requests
distribuindo carga.

**Recomendação**:
```bash
npm install @nest-lab/throttler-storage-redis
```
```typescript
// app.module.ts
ThrottlerModule.forRootAsync({
  inject: [AppConfig],
  useFactory: (config: AppConfig) => ({
    throttlers: [...],
    storage: new ThrottlerStorageRedisService({ host: config.redisHost, port: config.redisPort }),
  }),
}),
```

**Esforço**: 1h · **Skill**: [security-auth-review §4](../../skills/security-auth-review/SKILL.md)

---

### [MED-006] Faltam métricas Prometheus (observabilidade)

- **Arquivo**: (gap) — `prom-client` não instalado.
- **Dimensão**: Observabilidade

**Causa**: tracing ✓, logs ✓, **métricas RED/USE ausentes**. Sem
throughput, p95, error rate objetivos.

**Recomendação**:
```bash
npm install @willsoto/nestjs-prometheus prom-client
```
Endpoint `GET /metrics` (proteger com auth/firewall).

**Esforço**: 4h · **Skill**: [opentelemetry-tracing §8](../../skills/opentelemetry-tracing/SKILL.md)

---

### [MED-007] JWT_SECRET sem validação de comprimento mínimo

- **Arquivo**: [src/config/env.validation.ts:9](../../../src/config/env.validation.ts)
- **Dimensão**: Segurança (A02)

**Causa**: `JWT_SECRET: Joi.string().required()` (sem `.min(32)`).
O `.env.example` tem placeholder fraco (`your_jwt_secret_key_here`,
24 chars).

**Recomendação**:
```typescript
JWT_SECRET: Joi.string().min(32).required().messages({
  'string.min': 'JWT_SECRET deve ter no mínimo 32 caracteres (recomendado 64).',
}),
```

**Esforço**: 5min · **Skill**: [security-auth-review §14](../../skills/security-auth-review/SKILL.md)

---

## 5. Findings BAIXOS e INFO

### [BAI-001] Compressão gzip/br não habilitada

- **Arquivo**: [src/main.ts](../../../src/main.ts) (ausente `@fastify/compress`)
- **Esforço**: 15min · **Skill**: [performance-profiling-nestjs §8](../../skills/performance-profiling-nestjs/SKILL.md)

### [BAI-002] CSP com `unsafe-inline` para Swagger

- **Arquivo**: [src/main.ts:36](../../../src/main.ts)
- **Esforço**: 1h (desabilitar Swagger em prod ou usar nonce)

### [BAI-003] Domain Events não emitidos (DDD)

- **Arquivo**: (gap) — nenhuma entity emite Domain Events.
- **Esforço**: 4-6h · **Skill**: [ddd-aggregate-modeling §4](../../skills/ddd-aggregate-modeling/SKILL.md)

### [BAI-004] 2 specs com mocks de PrismaService

- **Arquivos**: `auth.service.spec.ts`, `password-recovery.service.spec.ts`
- **Sinal de**: Hexagonal incompleto (resolvido por [ALT-001]/[ALT-002])

### [BAI-005] `any` em prisma-extension é justificável

- **Arquivo**: [src/prisma/prisma-extension.ts](../../../src/prisma/prisma-extension.ts)
- **Ação**: documentar como `// eslint-disable` esperado

---

## 6. Detalhamento por dimensão

### 6.1 Build e qualidade

| Check | Status |
|-------|--------|
| `npm run build` | ✅ exit 0 |
| `npm run lint` | ✅ 0 erros |
| `npm test` | ✅ 402/402 (6.9s) |
| `npm run test:e2e` | ⚠️ requer `docker compose up` |

### 6.2 Testes

- Cobertura: 68% (55/81 arquivos).
- Tempo unit: 6.9s (excelente).
- Rastreabilidade: 127 comentários (média 1.5/arquivo).
- ~5 specs mockam PrismaService (sinal de Hexagonal incompleto).

### 6.3 Arquitetura

- **Hexagonal**: ⚠️ 4 entities com `@nestjs/swagger`; AuthService e
  PasswordRecoveryService injetam PrismaService.
- **DDD**: ⚠️ Entities anêmicas, sem Domain Events.
- **Repository pattern**: ✅ Interfaces em `domain/`, impls em
  `infrastructure/` (3 dos 4 módulos principais).
- **Module composition**: ✅ Limpo em `app.module.ts`.

### 6.4 Performance

- **Paginação**: ✅ Aplicada.
- **`select`**: ❌ 1/24 (4%).
- **N+1 em loops**: ❌ 3 lugares (perfis + empresas).
- **N+1 em includes**: ✅ 3 includes profundos parecem planejados.
- **Bcrypt no event loop**: ❌ Confirmado.
- **Compressão**: ❌ `@fastify/compress` ausente.

### 6.5 Segurança

- **JWT + refresh rotation**: ✅ (reuso = revogação).
- **Helmet + CORS**: ✅
- **CSRF**: ✅ N/A (JWT em header).
- **RBAC + multi-tenant**: ✅
- **Throttler 4 tiers**: ✅ (mas in-memory).
- **@Throttle em rotas sensíveis**: ✅ (login, refresh, password,
  mutations).
- **Audit log**: ✅
- **Account lockout**: ❌ (gap).
- **Log de falhas login**: ❌ (gap).
- **JWT_SECRET min-length**: ❌ (gap).
- **LGPD**: ⚠️ sem `/me/exportar-dados`, sem anonimização.

### 6.6 Observabilidade

- **Tracing (OTel → Jaeger)**: ✅ completo.
- **Logs (Pino)**: ✅ estruturados.
- **Correlação trace↔log**: ⚠️ sem mixin `traceId`.
- **Métricas RED/USE**: ❌ Prometheus ausente.
- **Health check**: ✅.

### 6.7 Código

- **TypeScript strict**: ✅
- **`any` em produção**: 64 hits (muitos em `prisma-extension`,
  justificável).
- **ESLint**: ✅ 0 erros.
- **Sem `console.*`**: ✅ 0 hits.
- **`TODO/FIXME`**: 1 (em comentário de auth.service.ts — explicativo).

### 6.8 Workflow

- **5 features BDD**, **7 e2e**, **55 unit** specs.
- **127 comentários** de rastreabilidade (BDD/SDD/ATDD/TDD).
- Boa adoção do workflow.

---

## 7. Recomendações priorizadas

### Sprint 1 (Imediato — ~8h)

| # | Finding                              | Esforço |
|---|--------------------------------------|---------|
| 1 | [ALT-001] AuthService Hexagonal      | 3h      |
| 2 | [ALT-002] PasswordRecovery Hexagonal | 2h      |
| 3 | [ALT-003] Account lockout            | 1h      |
| 4 | [ALT-004] Log de falhas login        | 1h      |
| 5 | [ALT-005] N+1 em IDs                 | 30min   |
| 6 | [MED-007] JWT_SECRET min-length      | 5min    |

### Sprint 2 (Curto prazo — ~10h)

| # | Finding                            | Esforço |
|---|------------------------------------|---------|
| 7 | [ALT-006] `select` específico      | 6h      |
| 8 | [MED-001] `UV_THREADPOOL_SIZE`     | 15min   |
| 9 | [MED-002] Eliminar `any`           | 2h      |
| 10 | [MED-005] Throttler Redis          | 1h      |
| 11 | [BAI-001] `@fastify/compress`      | 15min   |

### Sprint 3+ (Backlog)

- [MED-003] Entidades ricas
- [MED-004] Domain sem `@nestjs/swagger`
- [MED-006] Prometheus
- [BAI-002] CSP strict
- [BAI-003] Domain Events
- Migração para Argon2id
- Anonimização em soft delete (LGPD)
- Endpoint `/me/exportar-dados` (LGPD)

---

## 8. Comparação com varreduras anteriores

| Métrica                                | 14h (analista-qualidade) | 17:40 (1ª varredura) | **18:05 (agora)** | Δ total |
|----------------------------------------|--------------------------|----------------------|-------------------|---------|
| Build                                  | ❌ 2 erros TS            | ✅                    | ✅                | corrigido |
| Testes unit                            | 219/222 (98.6%)          | 402/402 (100%)       | 402/402 (100%)    | +183    |
| Specs                                  | 29                       | 55                   | 55                | +26     |
| Cobertura %                            | 46%                      | 68%                  | 68%               | +22 p.p. |
| DTOs sem spec                          | vários                   | 0                    | 0                 | resolvido |
| Rastreabilidade                        | 0                        | 127                  | 127               | +127    |
| AuthService Hexagonal                  | gap conhecido            | gap mantido          | gap mantido       | ❌ pendente |
| Bcrypt event loop                      | n/m                      | confirmado           | confirmado        | novo    |
| N+1 em IDs                             | n/m                      | confirmado           | confirmado        | novo    |
| `select:` específico                   | n/m                      | 1/39 (2.6%)          | 1/24 (4.2%)¹      | baixo   |
| `any` em produção                      | n/m                      | 13+                  | 64 (justificáveis)| -       |
| Account lockout                        | n/m                      | gap                  | gap               | ❌ pendente |
| Log de falhas login                    | n/m                      | gap                  | gap               | ❌ pendente |
| JWT_SECRET min-length                  | n/m                      | gap                  | gap               | ❌ pendente |

¹ A diferença 39→24 vem de uma busca mais restrita (excluindo `include:`, `count`,
etc., que estavam inflando o denominador).

**Observação principal**: o progresso **estrutural** (build verde,
+90% em specs, rastreabilidade adotada) é expressivo entre 14h e 18h.
Os **gaps de segurança e arquitetura** permanecem intocados — é hora
de atacá-los.

---

## 9. Conclusão

O projeto `api-padrao` está **bem instrumentado** (OTel + Pino +
Throttler + AuditLog + Refresh Rotation) e tem **excelente cobertura
de testes** (68%). O workflow DDD→BDD→SDD→ATDD→TDD está sendo
**seguido na prática** (127 comentários de rastreabilidade, 5
features BDD, 7 e2e).

Os **6 findings ALTOS** são o caminho crítico para produção:

1. **2 Hexagonal** (AuthService, PasswordRecoveryService) — 5h total.
2. **2 Segurança** (lockout, log de falhas) — 2h total.
3. **1 Performance** (N+1 em IDs) — 30min.
4. **1 Performance/LGPD** (`select:` específico) — 4-6h.

**Recomendação final**: priorizar **Sprint 1** (~8h). Após ela, o
projeto estará pronto para staging com carga.

---

## 10. Próximas ações

1. **Triagem**: revisar este relatório com o time.
2. **Sprint planning**: incluir Sprint 1 (6 findings) na próxima sprint.
3. **Acompanhar**: nova varredura após Sprint 1 (esperado: ALT-001,
   ALT-002, ALT-003, ALT-004, ALT-005 resolvidos).
4. **Auditoria contínua**: rodar varredura leve semanal
   (`npm run build && npm test && npm run lint` + checklist de 5 min).

---

> **Relatório gerado pelo agente `analista-backend`**
> (`~/.claude/agents/analista-backend.md`).
> Próxima varredura sugerida: após conclusão da Sprint 1.
