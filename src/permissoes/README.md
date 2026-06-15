# Módulo de Permissões (`permissoes`)

Gerencia as permissões atômicas do sistema que são atribuídas aos perfis. Diferente dos perfis (escopados por empresa), as permissões são globais. O uso via `@TemPermissao(...)` está documentado em [AGENTS.md](../../AGENTS.md).

## Funcionalidades

- Cadastro de permissões (operações do sistema).
- Consulta de permissões por nome ou código.
- Atribuição granular de acesso.

## Endpoints

### Criar Permissão

- **URL**: `POST /permissoes`
- **Permissão**: `CREATE_PERMISSAO`.

### Listar Permissões

- **URL**: `GET /permissoes`
- **Permissão**: `READ_PERMISSOES`.
- **Parâmetros**: `PaginationDto` (`page`, `limit`).

### Buscar por ID

- **URL**: `GET /permissoes/:id`
- **Permissão**: `READ_PERMISSAO_BY_ID`.

### Atualizar Permissão

- **URL**: `PATCH /permissoes/:id`
- **Permissão**: `UPDATE_PERMISSAO`.
- **Nota**: apenas administradores podem restaurar permissões deletadas.

## Estrutura de uma Permissão

- **Nome**: nome legível (ex.: "Criar Usuário").
- **Código**: string única usada no código (ex.: `CREATE_USER`).
- **Descrição**: detalhes sobre o que a permissão autoriza.

## Governança

Diferente dos perfis, as permissões são **globais** no sistema, representando as ações possíveis que o código pode executar, independente da empresa. O header `x-empresa-id` é opcional nessas rotas, exceto para validação de contexto administrativo.

## Documentação relacionada

- [AGENTS.md](../../AGENTS.md) — fonte canônica: arquitetura, `@TemPermissao`, scopes.
- [src/perfis/README.md](../perfis/README.md) — perfis que recebem estas permissões.
