# API Padrão

## Descrição do Projeto

Este projeto é uma API RESTful robusta e escalável, desenvolvida com NestJS, utilizando Prisma como ORM e PostgreSQL como banco de dados. A arquitetura segue princípios de Clean Architecture, garantindo modularidade, testabilidade e fácil manutenção. A API inclui módulos essenciais para autenticação, gerenciamento de empresas, usuários, perfis e permissões, fornecendo uma base sólida para aplicações SaaS ou multi-tenant.

### Características Principais

*   **Autenticação Segura:** Implementação de autenticação JWT (JSON Web Tokens) para acesso seguro aos recursos da API.
*   **Gerenciamento de Empresas (Multi-tenancy):** Suporte a múltiplas empresas, onde usuários podem pertencer a várias empresas com perfis distintos em cada uma.
*   **Gerenciamento de Usuários:** Funcionalidades completas para criação, leitura, atualização, **deleção lógica (soft delete) e restauração** de usuários.
*   **Perfis e Permissões por Contexto:** Sistema granular de perfis e permissões escopados por empresa, permitindo controle de acesso detalhado.
*   **Logging Estruturado:** Uso de `nestjs-pino` para logs estruturados em JSON, ideais para observabilidade em produção.
*   **Gerenciamento de Configuração:** Uso de `@nestjs/config` com validação de esquema via Joi para variáveis de ambiente.
*   **Lógica de Hashing de Senha Abstraída:** A manipulação de senhas agora utiliza uma abstração (`PasswordHasher`), permitindo flexibilidade na escolha do algoritmo de hashing.
*   **Paginação:** Suporte a paginação em endpoints de listagem.
*   **Documentação Interativa:** Documentação completa gerada com Swagger/OpenAPI.
*   **Observabilidade (OpenTelemetry):** Instrumentação para rastreamento distribuído.

## Tecnologias Utilizadas

*   **Framework:** NestJS (v11.1.6)
*   **Linguagem:** TypeScript (v5.6.2)
*   **ORM:** Prisma (v6.15.0)
*   **Banco de Dados:** PostgreSQL (via Docker)
*   **Autenticação:** JWT, Passport.js, bcrypt
*   **Logging:** nestjs-pino
*   **Configuração:** @nestjs/config, Joi
*   **Validação:** class-validator, class-transformer
*   **Observabilidade:** OpenTelemetry, Jaeger
*   **Testes:** Jest, Supertest

## Primeiros Passos

### Pré-requisitos

*   [Node.js](https://nodejs.org/en/) (v20+)
*   [Docker](https://www.docker.com/) e Docker Compose

### Instalação

1.  Clone o repositório:
    ```bash
    git clone <URL_DO_REPOSITORIO>
    cd api-padrao
    ```
2.  Instale as dependências:
    ```bash
    npm install
    ```

### Configuração e Execução

1.  Crie um arquivo `.env` (baseado no exemplo anterior).
2.  Inicie os serviços (Postgres, Jaeger):
    ```bash
    docker compose up --build -d
    ```
3.  Execute as migrações:
    ```bash
    npx prisma migrate dev
    ```
4.  Inicie a aplicação:
    ```bash
    npm run start:dev
    ```

## Estrutura do Projeto

```
src/
├── auth/                   # Autenticação
├── empresas/               # Módulo de Empresas
├── usuarios/               # Módulo de Usuários
├── perfis/                 # Módulo de Perfis
├── permissoes/             # Módulo de Permissões
├── shared/                 # Compartilhados (Utils, DTOs)
└── prisma/                 # Prisma ORM
```

## Mudanças Recentes

*   **Empresas:** Adicionado módulo de empresas.
*   **Perfis de Usuário:** A relação entre Usuários e Perfis agora é mediada pela Empresa (`UsuarioEmpresa`). Um usuário não possui perfis globais, mas sim perfis específicos dentro de cada empresa que participa.

### Testes

*   **Unitários:** `npm run test`
*   **E2E:** `npm run test:e2e` (Requer `npm run test:migrate` antes)

## Licença

MIT