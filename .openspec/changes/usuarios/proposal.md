# Proposal: Módulo de Usuários (`usuarios`)

> **Status**: Retroativo (CR já implementado)
> **Tipo de mudança**: Documentação retroativa de feature entregue
> **Data de criação do CR**: 2026-06-15
> **Autor do CR (retroativo)**: Engenharia de Requisitos

## Why

O módulo `usuarios` é o núcleo de identidade do sistema `api-padrao`. Ele é responsável por todo o ciclo de vida de um usuário — desde o auto-cadastro (público) até a gestão administrativa (com escopo por empresa), passando por:

- Validação rigorosa de credenciais (e-mail único, política de senha forte).
- Separação clara entre conta de usuário (`Usuario`) e o vínculo com empresas (`UsuarioEmpresa`), refletindo o modelo multi-tenant.
- Soft delete e restauração, preservando integridade referencial e histórico de auditoria.
- Autorização granular baseada em permissões (`READ_USUARIOS`, `READ_USUARIO_BY_ID`, `UPDATE_USUARIO`, `READ_USUARIO_EMPRESAS`) com fallback para regras de "admin global" vs. "admin de empresa".

Esta CR é retroativa: a feature já está implementada, testada (unit + e2e) e em produção. O objetivo deste artefato é formalizar os requisitos, garantir rastreabilidade e servir como base para evoluções futuras (ex.: confirmação de e-mail, 2FA, lockout por tentativas, etc.).

## What Changes

Esta CR documenta a entrega dos seguintes componentes já implementados:

### Endpoints REST
- `POST /usuarios` — auto-cadastro público.
- `GET /usuarios` — listagem paginada (admin).
- `GET /usuarios/:id` — busca por ID (self ou admin).
- `PATCH /usuarios/:id` — atualização, soft delete e restauração.
- `GET /usuarios/:id/empresas` — listagem de empresas vinculadas a um usuário.

### Camadas da arquitetura DDD
- **Domain**: entidade `Usuario` (estende `BaseEntity`), `UsuarioEmpresa` (vínculo N:N com `Empresa`).
- **Application**: `UsuariosService`, `UsuariosController`, `IUsuarioAuthorizationService`, DTOs (`CreateUsuarioDto`, `UpdateUsuarioDto`).
- **Infrastructure**: `PrismaUsuarioRepository` (estende `BaseRepository`).

### Regras de negócio
- E-mail único no sistema.
- Senha forte obrigatória no cadastro (mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número **ou** 1 caractere especial).
- Senha hasheada com `bcrypt` antes de persistir; nunca retornada em responses (`@Exclude()` + `ClassSerializerInterceptor` global).
- Soft delete via `BaseEntity` (campos `ativo: boolean` e `deletedAt: Date | null`).
- Soft delete e restore via `PATCH /usuarios/:id` com `{ ativo: false }` / `{ ativo: true }`.
- Auto-cadastro é **público** (`@Public()`); demais endpoints exigem JWT.
- Perfis (`Perfis`) são sempre vinculados via `UsuarioEmpresa` (escopo por empresa), nunca diretamente ao `Usuario`.

### Qualidade
- 13 cenários BDD em `features/usuarios.feature`.
- Cobertura unitária em `src/usuarios/application/services/usuarios.service.spec.ts`.
- Cobertura e2e em `test/usuarios.e2e-spec.ts`.
- Auditoria em mutações via decorator `@Auditar`.
- Throttling em `PATCH` (`@Throttle({ sensitive: { limit: 10, ttl: 60000 } })`).

## Impact

### Impacto positivo
- Padronização do modelo de identidade para todos os módulos consumidores (`auth`, `empresas`, `perfis`, `permissoes`).
- Isolamento de credenciais em uma única fronteira (`auth`); demais módulos só consomem `Usuario.id` / `Usuario.email`.
- Multi-tenancy: o vínculo `UsuarioEmpresa` permite que o mesmo usuário participe de várias empresas com perfis distintos.
- Auditoria e throttling prontos para compliance (LGPD: rastros de criação/atualização, mitigação de brute-force em `PATCH`).

### Impacto em módulos existentes
- **`auth`**: consome `Usuario.email` + `senha` (hash) para emitir JWT.
- **`empresas`**: consome `UsuarioEmpresa` para vincular perfis (`Perfis`) a usuários.
- **`shared`**: provê `BaseEntity` (soft delete) e `BaseRepository` (filtro automático de `deletedAt: null`).
- **`prisma`**: provê schema com `Usuario`, `UsuarioEmpresa`, `Empresa`, `Perfil`, `Permissao`.

### Impacto em quem consome a API
- **Frontends**: precisam tratar 409 (e-mail duplicado) e 400 (validação) com mensagens amigáveis.
- **Integradores**: o e-mail é o identificador canônico no cadastro; o `id` numérico é a chave primária após criação.

## Risks

| Risco | Mitigação atual | Mitigação futura sugerida |
|-------|-----------------|---------------------------|
| E-mail pode ser alterado sem confirmação | Não há verificação de propriedade | Adicionar fluxo de "alteração de e-mail" com token de confirmação |
| Sem lockout por tentativas de login | Senha hasheada com `bcrypt` (custo ~10) | Implementar `account_lockout` + rate-limit em `POST /auth/login` |
| Senha trafega em texto claro | `POST /usuarios` exige HTTPS em produção | Forçar HSTS + documentar em deploy |
| `GET /usuarios` sem paginação explícita pode estourar memória | `PaginationDto` é obrigatório via `ValidationPipe({ transform: true })` | Adicionar limites rígidos no `PaginationDto` |
| Soft delete acumula linhas órfãs | `BaseEntity` usa `deletedAt` indexado | Implementar job de purge periódico (LGPD) |
| Senha exposta em logs de erro | `Logger` em `UsuariosService` loga apenas e-mail | Garantir que `interceptors` filtrem `senha` em toda exception |

## Out of Scope (não cobertos por esta CR)

- Recuperação de senha (`POST /auth/forgot-password`).
- Confirmação de e-mail no cadastro.
- Autenticação multi-fator (MFA / 2FA).
- Login social (Google, GitHub, etc.).
- Gestão de sessões (refresh token rotation já é responsabilidade de `auth`).
- Exclusão física (hard delete) de usuários.
