# Módulo Compartilhado (`shared`)

Contém utilitários, decoradores, filtros e serviços utilizados por múltiplos módulos da aplicação. Tudo aqui é global (cross-cutting concern) — ver [AGENTS.md](../../AGENTS.md) para a visão geral da arquitetura.

## Componentes Principais

### 1. Contexto de Empresa (`EmpresaContext`)

- **Tipo**: Request-scoped Service.
- **Função**: Armazena o `empresaId` e `usuarioId` da requisição atual. Permite que serviços de domínio acessem o contexto sem depender de parâmetros manuais.

### 2. Interceptor de Empresa (`EmpresaInterceptor`)

- **Função**: Extrai o `empresaId` do header `x-empresa-id` ou do payload do JWT e popula o `EmpresaContext`.

### 3. Filtro Global de Exceções (`AllExceptionsFilter`)

- **Função**: Captura todos os erros da aplicação e os formata em um padrão JSON consistente.

### 4. Decoradores Customizados

- `@UsuarioLogado()`: Extrai os dados do usuário do JWT.
- `@EmpresaId()`: Extrai o ID da empresa do contexto da requisição.

### 5. Hasher de Senha

Interface `PasswordHasher` e implementação `BcryptPasswordHasherService` para garantir segurança uniforme nas senhas.

### 6. Entidade Base (`BaseEntity`)

- **Campos**: `id`, `createdAt`, `updatedAt`, `deletedAt`, `ativo`.
- **Função**: Fornece a estrutura comum para suporte a soft delete em todas as entidades do sistema.

### 7. Interceptores de Sistema

- `LoggerErrorInterceptor`: Garante que erros sejam logados corretamente usando o Pino.
- `LoggingInterceptor`: Interceptor customizado para logar tempo de resposta e detalhes das requisições HTTP.

## Segurança e Rate Limit

`ThrottlerModule` configurado globalmente em [src/app.module.ts](../app.module.ts) com **4 tiers** (ver `THROTTLER_*` em [src/config/env.validation.ts](../config/env.validation.ts)):

- `short` — 3 req/s, para picos em endpoints quentes.
- `medium` — 20 req/10s, para endpoints gerais de leitura.
- `long` — 100 req/min, **tier dominante** (aplicado por padrão).
- `sensitive` — 10 req/min, aplicado via `@Throttle({ tier: 'sensitive' })` em rotas sensíveis (login, refresh).

## DTOs Globais

- `PaginationDto`: Padronização para todos os endpoints de listagem (default `page=1`, `limit=10`).
- `PaginatedResponseDto`: Estrutura padrão de resposta para listas — `{ data, total, page, limit, totalPages }`.

## Documentos relacionados

- [README_infra.md](./README_infra.md) — Docker, OTEL/Jaeger, env vars.
- [AGENTS.md](../../AGENTS.md) — visão geral da arquitetura, multi-tenancy, decorators.
