# Feature: Autenticação (auth) — Change Request

> **Tipo**: Change Request retroativo. A feature `auth` já está implementada e este documento registra formalmente a decisão de design, requisitos e tasks cumpridas.

## Why

A API `api-padrao` é multi-tenant e multi-perfil: cada `Usuario` pode estar vinculado a várias `Empresa` com `Perfil` + `Permissao` distintos. Sem uma camada de autenticação robusta, nenhum endpoint protegido pode existir, e sem proteção granular por empresa/permissão o modelo de tenancy não se sustenta.

A feature `auth` foi introduzida para estabelecer:

1. **Identidade verificável** dos usuários via e-mail + senha (com hash seguro via `PasswordHasher`).
2. **Sessões stateless** baseadas em JWT (`access_token`) com **renovação segura** via `refresh_token` opaco e rotacionado.
3. **Tenancy + RBAC embarcados no token** — o JWT carrega a lista de empresas, perfis e permissões do usuário para que guards e decorators (`@TemPermissao`) operem sem lookups adicionais a cada request.
4. **Proteção contra reuso de refresh tokens** — se um token revogado for reutilizado, todos os tokens do usuário são invalidados (detecção de roubo).
5. **Rate limiting** nos endpoints sensíveis (`/auth/login`, `/auth/refresh`) para mitigar brute force.
6. **Auditoria mínima** — cada login bem-sucedido grava um `LoginHistory` com IP e User-Agent.

A solução foi escolhida em vez de sessões server-side (sticky/Redis) para manter a API horizontalmente escalável e stateless, conforme as convenções do projeto descritas em `AGENTS.md`.

## What Changes

### Adiciona

- **Endpoints públicos**:
  - `POST /auth/login` — autentica por e-mail/senha e devolve par de tokens.
  - `POST /auth/refresh` — rotaciona o `refresh_token` e devolve novo par.
- **Modelos de persistência** (Prisma):
  - `RefreshToken` (`token`, `userId`, `expiresAt`, `revokedAt`).
  - `LoginHistory` (`userId`, `ip`, `userAgent`).
- **Serviço de aplicação** `AuthService` com métodos `login()` e `refreshTokens()`.
- **Guards e decorators**:
  - `AuthGuard` (global, estratégia JWT).
  - `@Public()` para liberar endpoints.
  - `@TemPermissao(...)` (compartilhado, mas sustentado pelo payload do JWT emitido aqui).
- **Rate limiting** tier `sensitive` (5/min login, 10/min refresh).
- **Documentação BDD** com 9 cenários em `features/autenticacao.feature`.

### Não altera (escopo)

- Não implementa OAuth2/OIDC, MFA, SSO, magic-link ou password recovery (esses vivem em changes próprios: `password-recovery`, etc.).
- Não altera a modelagem de `Usuario`, `Perfil`, `Permissao` ou `Empresa` (apenas os referencia via `findByEmailWithPerfisAndPermissoes`).
- Não introduz sessão server-side — segue o modelo stateless do projeto.

## Impact

| Área | Tipo de impacto | Descrição |
|------|-----------------|-----------|
| Banco de dados | Migration | Duas novas tabelas: `refresh_tokens` e `login_history`. |
| Outros módulos | Dependência | `usuarios`, `perfis`, `permissoes` precisam existir para popular o payload do JWT. |
| Segurança | Endurecimento | Hash de senha obrigatório, JWT com `HS256`, rotação + detecção de reuso. |
| Operacional | Configuração | Novas envs: `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_DAYS`, `THROTTLER_SENSITIVE_LIMIT(_REFRESH)`. |
| API pública | Contrato | 2 novos endpoints públicos; 1 payload novo (`access_token` + `refresh_token`). |
| Testes | Cobertura | 9 cenários BDD + 6 testes e2e + 5 testes unitários do service. |

### Usuários impactados

- **Consumidores da API**: precisam implementar fluxo `login → usar access_token → refresh`.
- **Operações**: precisam rotacionar `JWT_SECRET` e monitorar `LoginHistory`.

## Risks

Todos os riscos abaixo são **baixos** porque a feature já está implementada, testada (unit + e2e + BDD) e em uso. Esta documentação é retroativa.

| Risco | Probabilidade | Impacto | Mitigação existente |
|-------|---------------|---------|---------------------|
| Vazamento de `JWT_SECRET` | Baixa | Alto | Carregado de env (`ConfigService.getOrThrow`); ausência quebra o boot. Rotação documentada. |
| Brute force em `/auth/login` | Média | Médio | Rate limit `sensitive` (5 req/min/IP). |
| Reuso de refresh token roubado | Baixa | Alto | Detecção: token revogado → revoga toda a cadeia do usuário (403). |
| Bloat do JWT | Baixa | Baixo | Apenas `id/codigo` de perfis/permissões no payload (ver `JwtStrategy.validate`). |
| Crescimento ilimitado de `RefreshToken`/`LoginHistory` | Média | Médio | Índices em `userId`; limpeza é responsabilidade de job externo (fora do escopo). |
| Clock skew em `expiresAt` | Baixa | Baixo | Validação padrão do `@nestjs/jwt` (`ignoreExpiration: false`). |

## Status

- [x] Implementado
- [x] Testado (BDD + ATDD + TDD)
- [x] Documentado (este CR + `src/auth/README.md` + `AGENTS.md`)
