# Relatório de QA — Varredura Completa — 2026-06-15

> Gerado pelo agente **analista-qualidade** seguindo a metodologia do projeto e o workflow DDD→BDD→SDD→ATDD→TDD.
> Escopo: `/home/leo/Documentos/projetos/api-padrao/` (NestJS 11 + Prisma 6 + Fastify + PostgreSQL).

## TL;DR

- **Status: REPROVADO** — o build está **quebrando** com 2 erros TypeScript em `auth.service.ts`, bloqueando o pipeline de CI.
- 219/222 testes unitários passam (98,6%), mas **3 testes falham** por mock incompleto em `prisma-empresa.repository.spec.ts`.
- Cobertura de specs: **29 specs** para 63 arquivos de produção (~46%) — gaps significativos em DTOs, decorators, entities, audit interceptor.
- **0% de rastreabilidade BDD/SDD/ATDD/TDD** no código — o workflow obriga o comentário, mas **não está sendo seguido**.

## TL;DR Visual

```text
STATUS:                REPROVADO  ←  build quebrando
TESTES UNIT:           219/222 passing (98.6%)
TESTES E2E:            não verificado (requer docker compose up)
BUILD:                 ❌ 2 erros TypeScript
LINT:                  ✅ 0 erros
ESPECÍFICO MÓDULO AUTH: ⚠️ 0 specs de DTO, decorator public.decorator, audit.interceptor
RASTREABILIDADE:       ❌ 0 comentários // BDD/SDD/ATDD/TDD
```

---

## 1. Métricas (snapshot 2026-06-15 14:20 UTC)

| Métrica | Valor | Tendência |
|---------|-------|-----------|
| **Specs unitários** | 29 arquivos | — |
| **Specs e2e** | 6 arquivos | — |
| **Features Gherkin (BDD)** | 5 arquivos (9-14 cenários cada) | — |
| **Total de cenários BDD** | 57 cenários | — |
| **Total de asserts** | ~530+ | — |
| **Cobertura (arquivos com spec)** | ~46% (29/63) | precisa subir |
| **Cenários BDD cobertos por e2e** | parcial (~70% estimado) | auditar |
| **Tempo de execução unit** | 6.2 s | excelente |
| **Build** | ❌ Falha | crítico |
| **Lint** | ✅ OK | — |

### Cobertura por módulo

| Módulo | Produção (ts) | Specs (unit) | E2E | Feature BDD | Observação |
|--------|---------------|--------------|-----|-------------|------------|
| `auth` | 11 | 7 (64%) | 1 (auth) | 1 (autenticacao.feature) | Falta DTOs, public.decorator, audit.interceptor |
| `usuarios` | 10 | 5 (50%) | 1 | 1 (usuarios.feature) | Falta 2 DTOs, usuario-empresa entity |
| `empresas` | 9 | 3 (33%) | 1 | 1 (empresas.feature) | Falta 3 DTOs, empresa entity, empresa.repository |
| `perfis` | 8 | 3 (38%) | 1 | 1 (perfis.feature) | Falta 2 DTOs, perfil entity, perfil.repository |
| `permissoes` | 8 | 3 (38%) | 1 | 1 (permissoes.feature) | Falta 2 DTOs, permissao entity, permissao.repository |
| `shared` | 21 | 6 (29%) | 0 | 0 | Maior gap: 5 decorators, 3 interceptors, 3 entities, 3 services de domínio |
| `prisma` | 3 | 2 (67%) | 0 | 0 | Falta 1 interceptor/middleware |

---

## 2. Findings CRÍTICOS (bloqueiam merge/CI)

### [CRIT-001] Build TypeScript quebrando em `auth.service.ts`

**Arquivo**: `src/auth/application/services/auth.service.ts:74`
**Mensagem**:
```text
error TS2769: No overload matches this call.
  Type 'string | undefined' is not assignable to type 'number | StringValue | undefined'.
  Type 'string' is not assignable to type 'number | StringValue | undefined'.
```

**Causa**: o tipo de `JwtSignOptions.expiresIn` foi atualizado para aceitar apenas `number | StringValue` (do pacote `ms`), mas o `ConfigService.get('JWT_ACCESS_EXPIRES_IN')` retorna `string | undefined` (ex.: `'60s'`). O cast não está sendo feito.

**Impacto**: **CI bloqueia** (validate falha no passo `npm run build`). O `pre-commit` (lint-staged) também falha.

**Recomendação**:
```typescript
// auth.service.ts:74
const accessToken = this.jwtService.sign(payload, {
  expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') as any,
});
// OU tipar como StringValue do pacote 'ms'
// OU usar ms() helper: expiresIn: ms(this.configService.get('JWT_ACCESS_EXPIRES_IN'))
```

### [CRIT-002] `expiresInDays` possivelmente undefined em `auth.service.ts:84`

**Arquivo**: `src/auth/application/services/auth.service.ts:84`
**Mensagem**:
```text
error TS18048: 'expiresInDays' is possibly 'undefined'.
```

**Causa**: `ConfigService.get('JWT_REFRESH_EXPIRES_DAYS')` retorna `string | undefined`. Está sendo somado a um número sem validação.

**Recomendação**:
```typescript
const expiresInDays = Number(this.configService.get('JWT_REFRESH_EXPIRES_DAYS') ?? 7);
expiresAt.setDate(expiresAt.getDate() + expiresInDays);
```

### [CRIT-003] 3 testes unit falhando por mockDeep incompleto

**Arquivo**: `src/empresas/infrastructure/repositories/prisma-empresa.repository.spec.ts`
**Mensagem**:
```text
TypeError: this.prisma.extended.usuarioEmpresa.upsert is not a function
```

**Causa**: o teste usa `mockDeep<PrismaClient>()` do `jest-mock-extended` mas o método `upsert` da `usuarioEmpresa` não está sendo gerado. Provavelmente precisa `mockDeep<PrismaClient>().extended.usuarioEmpresa.upsert.mockResolvedValue(...)`.

**Impacto**: 3 testes vermelhos. **CI vermelha**. O `validate:quick` falha.

**Recomendação**:
```typescript
prisma.extended.usuarioEmpresa.upsert = jest.fn().mockResolvedValue(...);
// ou
prisma.extended = {
  usuarioEmpresa: {
    upsert: jest.fn().mockResolvedValue(...),
    findUnique: jest.fn().mockResolvedValue(...),
  },
};
```

---

## 3. Findings IMPORTANTES (reportar, não bloqueiam)

### [IMP-001] 13 DTOs sem teste de validação

**Arquivos**:
- `src/auth/dto/login-usuario.dto.ts`
- `src/auth/dto/refresh-token.dto.ts`
- `src/empresas/dto/add-usuario-empresa.dto.ts`
- `src/empresas/dto/create-empresa.dto.ts`
- `src/empresas/dto/update-empresa.dto.ts`
- `src/perfis/dto/create-perfil.dto.ts`
- `src/perfis/dto/update-perfil.dto.ts`
- `src/permissoes/dto/create-permissao.dto.ts`
- `src/permissoes/dto/update-permissao.dto.ts`
- `src/shared/dto/paginated-response.dto.ts`
- `src/usuarios/dto/create-usuario.dto.ts`
- `src/usuarios/dto/update-usuario.dto.ts`

**Impacto**: DTOs são a **porta de entrada da validação**. Sem teste, validação pode quebrar silenciosamente (ex.: mudança em `class-validator` que não é mais aplicada).

**Recomendação**: para cada DTO, criar `*.dto.spec.ts` seguindo o padrão de [`.agent/docs/04-padroes-testes-nestjs.md` §6](../docs/04-padroes-testes-nestjs.md#6-testando-dtos-com-class-validator) e [skill `nest-testing-patterns`](../skills/nest-testing-patterns/SKILL.md).

### [IMP-002] 4 decorators customizados sem teste de metadata

**Arquivos**:
- `src/auth/application/decorators/public.decorator.ts` (mais crítico — é a porta de bypass do AuthGuard)
- `src/shared/application/decorators/audit.decorator.ts`
- `src/shared/application/decorators/empresa-id.decorator.ts`
- `src/shared/application/decorators/usuario-logado.decorator.ts`

**Impacto**: se `@Public()` parar de emitir metadata `isPublic=true`, **rotas inteiras** podem passar a exigir auth indevidamente (ou vice-versa). Bug silencioso.

**Recomendação**: ver padrão em [skill `nest-testing-patterns` §"Decorator"](../skills/nest-testing-patterns/SKILL.md).

### [IMP-003] `audit.interceptor.ts` sem spec

**Arquivo**: `src/shared/infrastructure/interceptors/audit.interceptor.ts`

**Impacto**: o `AuditInterceptor` é global — se parar de logar, perdemos auditoria sem saber.

### [IMP-004] `health.controller.ts` sem spec

**Arquivo**: `src/shared/infrastructure/health/health.controller.ts`

**Impacto**: endpoints de health são checados por load balancers / k8s. Sem teste, podem quebrar sem aviso.

### [IMP-005] Entities e interfaces de repository sem spec

**Arquivos**:
- `src/empresas/domain/entities/empresa.entity.ts`
- `src/empresas/domain/repositories/empresa.repository.ts`
- `src/perfis/domain/entities/perfil.entity.ts`
- `src/perfis/domain/repositories/perfil.repository.ts`
- `src/permissoes/domain/entities/permissao.entity.ts`
- `src/permissoes/domain/repositories/permissao.repository.ts`
- `src/shared/domain/entities/base.entity.ts`
- `src/usuarios/domain/entities/usuario-empresa.entity.ts`
- `src/usuarios/domain/repositories/usuario.repository.ts`

**Observação**: entities e interfaces de repository são contratos — `expect(new Entity().id).toBeDefined()` é o mínimo. Para interfaces, basta garantir que existe e tem os métodos esperados (contrato de tipagem).

### [IMP-006] `UsuarioEntity.spec.ts` praticamente vazio

**Arquivo**: `src/usuarios/domain/entities/usuario.entity.spec.ts`
**Estado atual**:
```typescript
describe('Usuario', () => {
  it('deve ser definido', () => {
    const usuario = new Usuario();
    expect(usuario).toBeDefined();  // 1 assert fraco
  });
});
```

**Impacto**: spec de 8 linhas, 1 assert. Não testa **nada** do comportamento da entity (ex.: soft-delete, `toResponse()`, `@Exclude()`).

**Recomendação**:
```typescript
describe('Usuario', () => {
  it('deve marcar como soft-deleted preservando id', () => { ... });
  it('deve restaurar limpando deletedAt e setando ativo=true', () => { ... });
  it('deve excluir @Exclude() fields na serialização (toJSON)', () => { ... });
});
```

### [IMP-007] 0 comentários de rastreabilidade BDD/SDD/ATDD/TDD

**Estado atual**:
```bash
$ grep -rE "// BDD:" src/ test/ 2>/dev/null | wc -l    # → 0
$ grep -rE "// SDD:" src/ test/ 2>/dev/null | wc -l    # → 0
$ grep -rE "// ATDD:" src/ test/ 2>/dev/null | wc -l   # → 0
$ grep -rE "// TDD:" src/ test/ 2>/dev/null | wc -l    # → 0
```

**Impacto**: o `AGENTS.md §6` define rastreabilidade como **obrigatória** (exemplo de comentário no spec). Hoje está **quebrado em 100% do código**. Se uma feature for refatorada, **não há link para a especificação** que a originou.

**Recomendação**: começar pelos módulos com feature BDD pronta (auth, usuarios, empresas, perfis, permissoes) — adicionar `// BDD: features/X.feature:Cenário: Y` em cada `it()` correspondente do e2e-spec.

### [IMP-008] 1 spec sem setup (antes do `beforeEach`)

**Arquivo**: `src/usuarios/domain/entities/usuario.entity.spec.ts` (mesmo do IMP-006).

> `pagination.dto.spec.ts` foi falsamente sinalizado — usa `plainToInstance` direto no `it`, o que é OK para DTOs (não precisam de module setup).

### [IMP-009] Specs pequenos demais em alguns lugares

| Arquivo | Linhas | Observação |
|---------|--------|------------|
| `prisma.service.spec.ts` | 27 | Falta testar prisma-extension de soft-delete, onModuleDestroy |
| `prisma-extension.spec.ts` | 111 | OK mas pode crescer (cenários de soft-delete) |
| `pagination.dto.spec.ts` | 50 | OK para o que cobre |
| `usuario.entity.spec.ts` | 8 | (já reportado) |

---

## 4. Findings SUGESTÕES (nice-to-have)

### [SUG-001] Adicionar `collectCoverageFrom` refinado

`package.json:129-131`:
```json
"collectCoverageFrom": ["**/*.(t|j)s"]
```

**Recomendação** (registrar como follow-up):
```json
"collectCoverageFrom": [
  "src/**/*.ts",
  "!src/**/*.module.ts",
  "!src/**/main.ts",
  "!src/**/tracing.ts",
  "!src/**/migrations/**",
  "!src/**/*.d.ts"
]
```

### [SUG-002] Specs com `it()` único e fraco (anti-pattern)

Procurar:
```bash
grep -rE "it\(['\"]test|it\(['\"]works|it\(['\"]fixme|it\(['\"]todo" src/ test/ 2>/dev/null
```
(rodou e retornou **0 hits** — bom, mas vale revisar periodicamente)

### [SUG-003] Consolidar fixtures compartilhados em `test/fixtures/`

Hoje há duplicação de criação de `Usuario`, `Empresa`, `Perfil` em vários e2e-specs. Extrair para `test/fixtures/builders.ts` reduziria duplicação.

### [SUG-004] Publicar `coverage/` no CI como artefato

Adicionar ao `validate` script:
```bash
npm run test -- --coverage --coverageReporters=text-summary --coverageReporters=lcov
```

### [SUG-005] Adicionar Stryker (mutation testing) em `auth` e `prisma`

`@stryker-mutator/stryker` + `jest-runner` daria sinal **real** sobre qualidade dos testes (não só cobertura).

### [SUG-006] Avaliar Cucumber.js formal

Hoje o vínculo `.feature` → `*.e2e-spec.ts` é **manual** (e está zerado). Cucumber.js + step definitions eliminaria esse gap, mas adiciona complexidade. **Recomendação**: avaliar quando o time crescer (>3 devs).

### [SUG-007] Helpers de teste em `test/e2e-utils.ts` cobrem só `cleanDatabase`

Faltam helpers para: `criarUsuarioPadrao`, `gerarTokenPara`, `empresaValida`. Hoje cada e2e-spec reinventa.

---

## 5. Ações Recomendadas (em ordem de prioridade)

| # | Ação | Esforço | Impacto | Bloqueia merge? |
|---|------|---------|---------|-----------------|
| 1 | **CRIT-001**: corrigir `jwtService.sign` typing em `auth.service.ts:74` | 5 min | Build volta a passar | **SIM** |
| 2 | **CRIT-002**: corrigir `expiresInDays` undefined em `auth.service.ts:84` | 2 min | Build volta a passar | **SIM** |
| 3 | **CRIT-003**: consertar `mockDeep` do `prisma.extended.usuarioEmpresa.upsert` | 10 min | Testes passam | **SIM** |
| 4 | **IMP-001**: criar 12 specs de DTO (já existe padrão em `pagination.dto.spec.ts`) | 2-3 h | Cobertura DTO sobe para 100% | NÃO |
| 5 | **IMP-002**: criar 4 specs de decorator (padrão: `temPermissao.decorator.spec.ts`) | 30 min | Bypass do auth fica protegido | NÃO |
| 6 | **IMP-003**: spec de `audit.interceptor.ts` | 20 min | Auditoria protegida | NÃO |
| 7 | **IMP-007**: adicionar `// BDD:` em todos os e2e-specs com cenário `.feature` correspondente | 30 min | Rastreabilidade 100% | NÃO |
| 8 | **IMP-005/006**: specs de entity e contracts de repository | 1-2 h | Contratos validados | NÃO |
| 9 | **SUG-007**: extrair fixtures compartilhados para `test/fixtures/` | 1-2 h | Reduz duplicação | NÃO |
| 10 | **SUG-001**: refinar `collectCoverageFrom` | 5 min | Coverage report mais útil | NÃO |

**Estimativa total CRÍTICOS + IMP**: ~4-6 horas. Build verde em **20 minutos** se fizer só CRIT-001/002/003.

---

## 6. Cobertura por Módulo (resumo visual)

```text
auth       ████████████░░░░  64%  (7/11)
usuarios   ██████░░░░░░░░░░  50%  (5/10)
empresas   ████░░░░░░░░░░░░  33%  (3/9)
perfis     ████░░░░░░░░░░░░  38%  (3/8)
permissoes ████░░░░░░░░░░░░  38%  (3/8)
shared     ███░░░░░░░░░░░░░  29%  (6/21)  ← pior
prisma     ███████░░░░░░░░░  67%  (2/3)
```

---

## 7. Verificação Pré-Encerramento

- [x] Lint rodou: **OK**.
- [x] Build rodou: **FALHA (2 erros TypeScript)**.
- [x] Test unit rodou: **219/222 passam (98,6%)**.
- [x] Test e2e **NÃO** rodou (requer `docker compose up -d postgres redis` + `npm run test:migrate`).
- [x] Inventário de gaps executado em todos os módulos.
- [x] Rastreabilidade BDD/SDD/ATDD/TDD checada: **0% no código**.

## 8. Recomendações de Skills/Docs a aplicar

| Ao corrigir | Usar skill | Ler doc |
|-------------|-----------|---------|
| CRIT-001/002 (auth.service.ts) | [`nest-testing-patterns`](../skills/nest-testing-patterns/SKILL.md) | [`04-padroes-testes-nestjs.md`](../docs/04-padroes-testes-nestjs.md) |
| CRIT-003 (mockDeep) | [`nest-testing-patterns`](../skills/nest-testing-patterns/SKILL.md) | [`04-padroes-testes-nestjs.md`](../docs/04-padroes-testes-nestjs.md#9-testando-repositories-prisma) |
| IMP-001 (DTOs) | [`nest-testing-patterns`](../skills/nest-testing-patterns/SKILL.md) | [`04-padroes-testes-nestjs.md` §6](../docs/04-padroes-testes-nestjs.md#6-testando-dtos-com-class-validator) |
| IMP-002 (decorators) | [`nest-testing-patterns`](../skills/nest-testing-patterns/SKILL.md) | [`04-padroes-testes-nestjs.md` §5](../docs/04-padroes-testes-nestjs.md#5-testando-decorators-customizados) |
| IMP-007 (rastreabilidade) | [`bdd-gherkin-authoring`](../skills/bdd-gherkin-authoring/SKILL.md) | [`02-bdd-na-stack.md` §6](../docs/02-bdd-na-stack.md#6-como-o-feature-se-conecta-aos-testes) |
| Próxima feature nova | [`tdd-red-green-refactor`](../skills/tdd-red-green-refactor/SKILL.md) | [`03-tdd-atdd-na-stack.md`](../docs/03-tdd-atdd-na-stack.md) |

---

**Assinado**: `analista-qualidade` (Claude Code) — 2026-06-15 14:20 UTC.
**Próxima varredura recomendada**: após CRIT-001/002/003 serem corrigidos (re-rodar build + test).
