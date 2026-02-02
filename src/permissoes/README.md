# Módulo de Permissões (`permissoes`)

Gerencia as permissões atômicas do sistema que são atribuídas aos perfis.

## Funcionalidades
- Cadastro de permissões (operações do sistema).
- Consulta de permissões por nome ou código.
- Atribuição granular de acesso.

## Endpoints

### 1. Criar Permissão
- **URL**: `POST /permissoes`
- **Permissão**: `CREATE_PERMISSAO`

### 2. Listar Permissões
- **URL**: `GET /permissoes`
- **Permissão**: `READ_PERMISSOES`

### 3. Buscar por ID
- **URL**: `GET /permissoes/:id`
- **Permissão**: `READ_PERMISSAO_BY_ID`

### 4. Atualizar Permissão
- **URL**: `PATCH /permissoes/:id`
- **Permissão**: `UPDATE_PERMISSAO`

## Estrutura de uma Permissão
- **Nome**: Nome legível (ex: "Criar Usuário").
- **Código**: String única usada no código (ex: `CREATE_USER`).
- **Descrição**: Detalhes sobre o que a permissão autoriza.

## Governança
Diferente dos perfis, as permissões são geralmente **globais** no sistema, representando as ações possíveis que o código pode executar, independente da empresa.
