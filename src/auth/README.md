# Módulo de Autenticação (`auth`)

Responsável pela segurança da API: tokens JWT, validação de acesso e controle por permissões. Detalhes de decorators globais, guards e `@TemPermissao` estão em [AGENTS.md](../../AGENTS.md).

## Funcionalidades

- Autenticação de usuários via e-mail e senha.
- Geração de tokens JWT contendo perfis e empresas vinculadas.
- Proteção de rotas via `AuthGuard` (global).
- Controle de acesso granular via `PermissaoGuard` + `@TemPermissao(...)`.

## Endpoints

### Login

- **URL**: `POST /auth/login`
- **Descrição**: autentica um usuário e retorna `access_token` + `refresh_token`.
- **Payload**: `LoginUsuarioDto` (`email`, `senha`).
- **Resposta 201**: `{ access_token, refresh_token, usuario, empresas }`.
- **Resposta 401**: credenciais inválidas (sem distinção "user não existe" vs "senha errada").
- **Rate limit**: tier `sensitive` — 5 req/min por IP.
- **Acesso**: público (`@Public()`).

### Refresh Token

- **URL**: `POST /auth/refresh`
- **Descrição**: renova o `access_token` a partir de um `refresh_token` válido, com **rotação** (devolve um novo par de tokens e revoga o anterior).
- **Payload**: `RefreshTokenDto` (`refresh_token`).
- **Resposta 201**: novos `{ access_token, refresh_token }`.
- **Resposta 401**: refresh token inválido, expirado ou já revogado.
- **Resposta 403**: atividade suspeita detectada (token reusado após revogação — invalida toda a cadeia).
- **Rate limit**: tier `sensitive` — 10 req/min por IP.
- **Acesso**: público (`@Public()`).

### Recuperação de Senha

Fluxo self-service de "esqueci minha senha" em 2 etapas. Veja a spec completa em
[`.openspec/changes/password-recovery/design.md`](../../.openspec/changes/password-recovery/design.md).

#### Forgot Password

- **URL**: `POST /auth/forgot-password`
- **Descrição**: gera um token de redefinição (32 bytes random → 64 hex chars), persiste
  o **hash SHA256** no DB e envia o link `${FRONTEND_URL}/reset-password?token=<plain>` por
  e-mail. A resposta é **sempre 200** com body vazio — anti-enumeração (não revela se o e-mail existe).
- **Payload**: `ForgotPasswordDto` (`email`).
- **Resposta 200**: body vazio (`{}`), sempre, inclusive se o e-mail não existir.
- **Resposta 400**: e-mail ausente ou em formato inválido (`E-mail inválido`).
- **Resposta 429**: rate limit `sensitive` excedido.
- **Rate limit**: tier `sensitive` — 5 req/min por IP (env `THROTTLER_SENSITIVE_LIMIT_FORGOT`).
- **Acesso**: público (`@Public()`).
- **Side-effects (somente se e-mail existir e usuário estiver ativo)**:
  1. `PasswordResetToken` criado com `tokenHash = sha256(token)`, `expiresAt = now + 60min`, `usedAt = null`.
  2. Tokens pendentes do mesmo usuário marcados como `usedAt = now()` (cascade).
  3. `EmailService.send` chamado (mock Pino em dev/test, SMTP em prod).

#### Reset Password

- **URL**: `POST /auth/reset-password`
- **Descrição**: valida o token (hash + expiração + `usedAt`), aplica `PasswordHasher.hash`
  na nova senha, marca `usedAt = now()`, e **revoga todos os `RefreshToken` ativos** do usuário
  (cascade — defesa em profundidade).
- **Payload**: `ResetPasswordDto` (`token` plain de 64 hex chars, `novaSenha` com requisitos).
- **Resposta 200**: body vazio (`{}`) em sucesso.
- **Resposta 400**: token inválido/expirado/usado, ou `novaSenha` inválida.
- **Resposta 401**: token não encontrado, expirado ou já utilizado.
- **Resposta 429**: rate limit excedido.
- **Rate limit**: tier `sensitive` — 10 req/min por IP (env `THROTTLER_SENSITIVE_LIMIT_RESET`).
- **Acesso**: público (`@Public()`).

#### Exemplo curl

```bash
# 1) Solicitar link de reset
curl -X POST http://localhost:3001/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"usuario@empresa.com"}'

# 2) O link é logado no Pino (LoggerEmailService) — em prod, enviado por SMTP

# 3) Resetar a senha usando o token recebido
curl -X POST http://localhost:3001/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token":"<64-hex-chars>","novaSenha":"NovaSenhaForte123!"}'
```

#### Segurança

- **Anti-enumeração**: `forgot-password` retorna 200 + body vazio independentemente de o e-mail existir.
- **Token opaco**: 32 bytes random via `crypto.randomBytes` (256 bits, 2^256 combinações).
- **Hash no DB**: somente `sha256(token)` é persistido. O token plain aparece **apenas** no e-mail.
- **TTL**: 60 minutos (`PASSWORD_RESET_EXPIRES_MINUTES`).
- **Uso único**: `usedAt != null` → 401. Reaproveitar o mesmo token sempre falha.
- **Cascade revocation**: o reset revoga **todos** os `RefreshToken` ativos do usuário em uma única transação Prisma.

## Mecanismos de Proteção

### AuthGuard (global)

Todas as rotas da API são protegidas por padrão, exigindo `Authorization: Bearer <token>`. Veja [src/auth/application/guards/auth.guard.ts](./application/guards/auth.guard.ts).

### `@Public()`

Usado em `auth/login` e em endpoints de health para abrir exceção à proteção global.

### `@TemPermissao(...permissoes)`

Restringe o acesso a usuários que possuem as permissões listadas **no contexto da empresa** informada via `x-empresa-id`. Veja [src/auth/application/decorators/temPermissao.decorator.ts](./application/decorators/temPermissao.decorator.ts).

## Fluxo de Autenticação

1. O usuário envia credenciais para `/auth/login`.
2. O sistema valida as credenciais e busca os perfis/permissões do usuário em cada empresa onde ele atua.
3. Um JWT é gerado contendo:
   - `sub`: ID do usuário.
   - `email`: e-mail do usuário.
   - `empresas`: lista de empresas e perfis vinculados.

## Documentação relacionada

- [AGENTS.md](../../AGENTS.md) — fonte canônica: arquitetura, comandos, guards, env vars.
- [src/shared/README.md](../shared/README.md) — `EmpresaContext`, interceptors, decorators.
