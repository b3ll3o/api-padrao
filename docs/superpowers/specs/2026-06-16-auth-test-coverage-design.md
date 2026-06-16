# Design — Atualização de Testes do Módulo `auth` (cobertura >= 90%)

**Data**: 2026-06-16
**Escopo**: módulo `auth` apenas (outros módulos em rodadas futuras)
**Tipo**: design de teste (sem alterações no código de produção)
**Critério de pronto**: `npm run test:cov` mostra >= 90% em **todas as 4 métricas** (statements, branches, functions, lines) para os arquivos de `src/auth/`, e `npm run test:e2e -- --testPathPattern=auth` passa.

## Contexto

A API `api-padrao` é multi-tenant (NestJS 11 + Prisma 6 + Fastify) e usa o módulo `auth` para gerenciar todo o ciclo de identidade: login JWT, refresh com rotação, account lockout via Redis, recuperação de senha com tokens SHA256, autorização por permissão, validação de headers `x-empresa-id`. O módulo tem 18 arquivos de produção e 15 specs, e cobertura atual em ~85% (acima do limite mínimo de 80%).

Esta rodada é a **primeira** de uma sequência (próximas: `usuarios`, `empresas`, `perfis`/`permissoes`, `shared`). O objetivo é identificar e preencher os gaps de cobertura do `auth`, com priorização por criticidade.

## Princípios e padrões seguidos

- **Hexagonal/DDD**: o código de produção já está desacoplado (DIP — `AuthService` depende de portas, não de `Prisma`). Os testes mockam as **portas**.
- **Factories de domínio**: `makeUsuario()`, `makePerfil()`, `makePermissao()` para construir entidades sem acoplar a campos privados (convenção MED-003).
- **Comentários de rastreabilidade**: cada `it()` linka o cenário BDD correspondente (`// BDD: features/autenticacao.feature:...`).
- **Co-localização**: unitários em `src/auth/**`, e2e em `test/`.
- **Validação por onda**: cada onda gera um commit; `npm run validate:quick` precisa passar ao final.

## Estratégia de ondas

| # | Onda | Foco | Tipo | Commit |
|---|------|------|------|--------|
| 1 | Login + Refresh | `auth.service.spec.ts`, `auth.controller.spec.ts`, `test/auth.e2e-spec.ts` | unit + e2e | `test(auth): onda 1 — login + refresh gaps` |
| 2 | Password Recovery | `password-recovery.service.spec.ts`, `test/auth-password-recovery.e2e-spec.ts` | unit + e2e | `test(auth): onda 2 — password recovery gaps` |
| 3 | Guards + JWT Strategy | `permissao.guard.spec.ts`, `jwt.strategy.spec.ts` | unit | `test(auth): onda 3 — guards + jwt gaps` |
| 4 | DTOs | `login-usuario.dto.spec.ts`, `reset-password.dto.spec.ts` | unit | `test(auth): onda 4 — dto edge cases` |

**Por que esta ordem?** Onda 1-2 cobrem os fluxos de maior risco de segurança (perímetro de autenticação, recuperação). Onda 3-4 fecha detalhes técnicos.

## Onda 1 — Login + Refresh

### `src/auth/application/services/auth.service.spec.ts`

**`login()` — casos novos**:
- `user.senha` é `null`/`undefined` → `UnauthorizedException` (path: `!user.senha`)
- `loginUsuarioDto.senha` é `null`/`undefined` → `UnauthorizedException` (path: `!loginUsuarioDto.senha`)
- Verificar log estruturado `event: 'auth.login.blocked'` quando bloqueado
- Verificar que `findByEmailWithPerfisAndPermissoes` é chamado **antes** de `recordFailure` (ordem) no caso de **falha** (sucesso não chama `recordFailure`)
- Verificar que `LoginHistory.record` é chamado com `ip: undefined, userAgent: undefined` quando o service é invocado sem `ip`/`userAgent` (controller não repassou)

**`generateTokens()` — testes diretos** (atualmente só é exercido indiretamente via `login`):
- `empresas: undefined` → JWT contém `empresas: []`
- `empresas: []` → JWT contém `empresas: []`
- `JWT_REFRESH_EXPIRES_DAYS` ausente no config → fallback para 7 dias (verifica `expiresAt` em ~7 dias)
- `JWT_ACCESS_EXPIRES_IN` ausente → `expiresIn: undefined` é aceito pelo `jwtService.sign`
- Verifica que o JWT payload final tem o shape esperado: `{ sub, email, empresas: [{ id, perfis: [{ codigo, permissoes: [{ codigo }] }] }] }`

**`refreshTokens()` — casos novos**:
- `tokenRecord.user.empresas` é `undefined` → passado para `generateTokens` (cobre mapeamento de `?? []`)
- `tokenRecord.user` é válido mas o `findByTokenWithUser` retornou `user` sem `empresas` → 200, novo token gerado, sem perfis no JWT

### `src/auth/application/controllers/auth.controller.spec.ts`

**Métodos atualmente não cobertos** (só `login` é testado):
- `refresh(dto)`: chama `authService.refreshTokens(dto.refresh_token)` e propaga o resultado
- `forgotPassword(dto)`: chama `passwordRecoveryService.forgotPassword(dto)` e retorna `undefined`
- `resetPassword(dto)`: chama `passwordRecoveryService.resetPassword(dto)` e retorna `undefined`

### `test/auth.e2e-spec.ts`

**Fluxos novos** (atualmente só há testes de login):
- `POST /auth/refresh` com refresh token válido: round-trip login → refresh → decode do novo access token → asserção de que `sub` e `email` batem com o usuário criado
- `POST /auth/refresh` com refresh token inválido → 401
- `POST /auth/refresh` com refresh token revogado (reuso) → 403 + cadeia inteira revogada (verifica via `prisma.refreshToken.count({ where: { revokedAt: null } })`)
- `POST /auth/login` com JWT contendo `empresas` (verifica `decoded.empresas` tem a estrutura esperada: array com `id`, `perfis[].codigo`, `perfis[].permissoes[].codigo`)
- `POST /auth/login` 6x com senha errada → 429 (conta bloqueada via Redis; depende de `CACHE_MANAGER` no e2e)

> **Nota sobre o e2e de account lockout**: o `.env.test` deve ter `CACHE_TTL`/`REDIS_*` configurados e o Redis disponível. Se o teste for flaky por Redis ausente, marcar com `it.skip` + `it.todo` linkando a issue.

## Onda 2 — Password Recovery

### `src/auth/application/services/password-recovery.service.spec.ts`

**`forgotPassword()` — casos novos**:
- `configService.get('FRONTEND_URL')` retorna `undefined` → URL usa fallback `http://localhost:3000/reset-password?token=...`
- Verificar que o `body` do e-mail contém o token plain (não o hash)
- 2 chamadas sucessivas com mesmo e-mail: a 1ª cria token, a 2ª invalida o anterior antes de criar novo (verifica `invocationCallOrder`)
- `user.id` é usado corretamente nas chamadas de `invalidateAllForUser` e `create`
- `passwordHasher` NÃO é chamado em `forgotPassword` (só em `resetPassword`)

**`resetPassword()` — casos novos**:
- `passwordHasher.hash` lança erro → `unitOfWork.execute` é chamado (rollback natural do `$transaction`)
- Log de sucesso tem `userId: token.userId`
- Verifica que o hash **não** é igual ao plain token (defesa em profundidade)

### `test/auth-password-recovery.e2e-spec.ts`

**Cenários novos**:
- `POST /auth/reset-password` com token **já usado** (`usedAt != null`) → 401
- `POST /auth/forgot-password` com usuário **inativo** (`ativo: false`) → 200 silencioso + nenhum `PasswordResetToken` criado
- `POST /auth/forgot-password` 2x pelo mesmo e-mail: cascade — o 1º token fica com `usedAt` setado, o 2º é o válido
- `POST /auth/reset-password` revoga **todos** os `RefreshToken` ativos do usuário (cria um refresh token antes, valida que após reset está com `revokedAt`)
- Login com senha antiga **falha** após reset, login com senha nova **passa**

## Onda 3 — Guards + JWT Strategy

### `src/auth/application/guards/permissao.guard.spec.ts`

**Bordas novas**:
- `vinculoEmpresa.perfis` é `undefined` → `ForbiddenException` ("não possui perfis vinculados")
- `vinculoEmpresa.perfis` é `null` → idem
- `requiredPermissoes` é array vazio `[]` → `some()` retorna `false` → `ForbiddenException` (comportamento documentado: precisa de pelo menos 1)
- `perfil.permissoes` é `undefined` → `some(undefined)` é `false` → `ForbiddenException`
- `vinculoEmpresa` encontrada com sucesso → `request.empresaContext` é anexado (verificar estrutura)
- Múltiplas empresas: usuário tem `empresa-a` e `empresa-b`, header `x-empresa-id: empresa-b` → valida o `empresaContext` da `empresa-b` (não da `a`)

### `src/auth/infrastructure/strategies/jwt.strategy.spec.ts`

**Bordas novas**:
- `payload.empresas[i].perfis[j].permissoes` é `undefined` → `validate` retorna com `permissoes: undefined`
- `payload.empresas[i].perfis` é `undefined` → `validate` retorna com `perfis: undefined`
- `payload.sub` é `undefined` → `result.userId` é `undefined`
- `payload.userId` (legado) em vez de `sub` → garantir que `userId` também é aceito (atualmente o código só lê `payload.sub`)

### `src/auth/application/guards/auth.guard.spec.ts`

Já está bem coberto. **Sem alterações**.

## Onda 4 — DTOs

### `src/auth/dto/login-usuario.dto.spec.ts`

- Senha com exatamente 7 caracteres → falha (limite mínimo -1)
- Senha com exatamente 8 caracteres → passa (limite mínimo)
- `email` em uppercase → passa (validador `IsEmail` é case-insensitive)

### `src/auth/dto/reset-password.dto.spec.ts`

- Token com mais de 128 caracteres → falha (`MaxLength(128)`)
- `novaSenha` sem maiúscula → falha com mensagem "deve conter pelo menos uma letra maiúscula"
- `novaSenha` sem minúscula → falha com mensagem "deve conter pelo menos uma letra minúscula"
- `novaSenha` sem número → falha com mensagem "deve conter pelo menos um número"
- `novaSenha` com todos os requisitos → passa

### `src/auth/dto/forgot-password.dto.spec.ts` e `refresh-token.dto.spec.ts`

Já estão cobertos. **Sem alterações**.

## Comandos de validação

Ao final de cada onda:

```bash
# 1. Lint
npm run lint

# 2. Unitários do módulo
npm run test -- src/auth

# 3. Cobertura (verificar >= 90% no auth)
npm run test:cov
# Ler a saída do coverage/lcov-report/index.html e confirmar

# 4. E2E do auth (requer docker compose up -d postgres redis)
npm run test:e2e -- --testPathPattern=auth

# 5. Build
npm run build
```

Ao final de todas as ondas:

```bash
npm run validate:quick
```

## Critérios de Pronto

- Cada arquivo de produção em `src/auth/` tem **>= 90%** em statements, branches, functions e lines
- `npm run validate:quick` passa
- `npm run test:e2e -- --testPathPattern=auth` passa (lockout e2e pode ser `it.skip` documentado)
- 4 commits focados, um por onda
- Nenhum teste novo sem comentário `// BDD:` ou `// SDD:` linkando o cenário coberto
- Nenhuma alteração em código de produção

## Fora de Escopo

- Alterações no código de produção
- Cobertura dos módulos `usuarios`, `empresas`, `perfis`, `permissoes`, `shared` (rodadas futuras)
- Testes de mutação, performance, contrato
- Aumentar cobertura para > 95%

## Riscos e mitigações

- **E2E de lockout depende de Redis**: o `.env.test` precisa ter Redis configurado. Se a infra não estiver disponível, o teste pode ser flaky. Mitigação: pular com `it.skip` + TODO se o lockout não estiver disponível.
- **Mudança de comportamento esperado**: se algum teste novo **falhar**, pode indicar que o código de produção tem um bug (ex.: rota de erro não documentada). Nesse caso, **parar** e reportar ao usuário antes de ajustar o teste para fazer o código passar.
- **Cobertura não chegar a 90%**: se após adicionar os testes planejados a cobertura não atingir 90%, voltar e adicionar mais casos na onda correspondente antes de seguir.
