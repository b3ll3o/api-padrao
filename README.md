# API Padrão

## Descrição do Projeto

Este projeto é uma API RESTful robusta e escalável, desenvolvida com NestJS, utilizando Prisma como ORM e PostgreSQL como banco de dados. A arquitetura segue princípios de Clean Architecture, garantindo modularidade, testabilidade e fácil manutenção. A API inclui módulos essenciais para autenticação, gerenciamento de usuários, perfis e permissões, fornecendo uma base sólida para diversas aplicações.

### Características Principais

*   **Autenticação Segura:** Implementação de autenticação JWT (JSON Web Tokens) para acesso seguro aos recursos da API.
*   **Gerenciamento de Usuários:** Funcionalidades completas para criação, leitura, atualização, **deleção lógica (soft delete) e restauração** de usuários, com suporte a múltiplos perfis.
*   **Perfis e Permissões:** Sistema granular de perfis e permissões, permitindo controle de acesso detalhado a diferentes funcionalidades da API, **incluindo deleção lógica (soft delete) e restauração de perfis e permissões**.
*   **Paginação:** Suporte a paginação em endpoints de listagem para otimização de desempenho e experiência do usuário.
*   **Documentação Interativa:** Documentação completa e interativa da API gerada automaticamente com Swagger/OpenAPI.
*   **Observabilidade (OpenTelemetry):** Instrumentação com OpenTelemetry para rastreamento distribuído (distributed tracing), facilitando a depuração e monitoramento da aplicação.

## Tecnologias Utilizadas

*   **Framework:** NestJS (v11.1.6)
*   **Linguagem:** TypeScript (v5.6.2)
*   **ORM:** Prisma (v6.15.0)
*   **Banco de Dados:** PostgreSQL (via Docker)
*   **Autenticação:** JWT (JSON Web Tokens), Passport.js, bcrypt
*   **Validação:** class-validator, class-transformer
*   **Observabilidade:** OpenTelemetry (SDK, Instrumentations), Jaeger
*   **Testes:** Jest, Supertest
*   **Estilo de Código:** ESLint, Prettier

## Primeiros Passos

### Pré-requisitos

Certifique-se de ter as seguintes ferramentas instaladas em sua máquina:

*   [Node.js](https://nodejs.org/en/) (versão 20.x ou superior)
*   [npm](https://www.npmjs.com/) (gerenciador de pacotes do Node.js)
*   [Docker](https://www.docker.com/) e Docker Compose (para gerenciar os contêineres de banco de dados, OpenTelemetry Collector e Jaeger)
*   [Git](https://git-scm.com/) (para controle de versão)

### Instalação

1.  Clone o repositório:
    ```bash
    git clone <URL_DO_REPOSITORIO> # Substitua pela URL real do seu repositório
    cd api-padrao
    ```
2.  Instale as dependências do projeto:
    ```bash
    npm install
    ```

### Configuração do Banco de Dados e Serviços

1.  Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis de ambiente:
    ```
    POSTGRES_USER=postgres
    POSTGRES_PASSWORD=postgres
    POSTGRES_DB=api-padrao
    PGADMIN_DEFAULT_EMAIL=admin@admin.com
    PGADMIN_DEFAULT_PASSWORD=admin
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/api-padrao"
    OTEL_SERVICE_NAME=api-padrao
    OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
    ```
    *Nota: Você pode alterar os valores conforme sua preferência.*

2.  Inicie os contêineres do PostgreSQL, pgAdmin, OpenTelemetry Collector e Jaeger usando Docker Compose (isso também construirá as imagens se necessário):
    ```bash
    docker compose up --build -d
    ```

3.  Execute as migrações do Prisma para criar o schema do banco de dados:
    ```bash
    npx prisma migrate dev
    ```

### Executando a Aplicação

#### Modo de Desenvolvimento

Para iniciar os serviços de banco de dados, OpenTelemetry Collector e Jaeger, utilize o Docker Compose:
```bash
docker compose up --build -d
```
Após os serviços estarem em execução, você pode iniciar a aplicação NestJS diretamente:
```bash
npm run start:dev
```
A aplicação NestJS estará disponível em `http://localhost:3000` (ou na porta configurada na variável de ambiente `PORT`). Certifique-se de que as variáveis de ambiente `DATABASE_URL` e `OTEL_EXPORTER_OTLP_ENDPOINT` estejam configuradas corretamente no seu arquivo `.env`.

#### Modo de Produção

```bash
npm run build
npm run start:prod
```

## Documentação da API (Swagger)

A documentação interativa da API está disponível através do Swagger UI.
Após iniciar a aplicação, acesse: `http://localhost:3000/swagger`

## Convenções de Desenvolvimento

### Estrutura do Projeto

O projeto segue uma arquitetura limpa (Clean Architecture) com a seguinte estrutura:

```
src/
├── auth/                   # Módulo de autenticação
│   ├── application/       # Casos de uso e controllers
│   ├── domain/           # Regras de negócio e entidades
│   ├── infrastructure/   # Implementações técnicas
│   └── dto/              # Objetos de transferência de dados
├── usuarios/              # Módulo de usuários
├── perfis/               # Módulo de perfis
├── permissoes/           # Módulo de permissões
└── prisma/               # Configuração do Prisma ORM
```

### Camadas da Arquitetura

*   **Domain**: Contém as regras de negócio e entidades.
*   **Application**: Implementa os casos de uso da aplicação.
*   **Infrastructure**: Lida com aspectos técnicos e frameworks.
*   **DTOs**: Define os objetos de transferência de dados.

### Testes

O projeto inclui testes unitários e de integração (E2E). Os testes são executados em um banco de dados separado para garantir o isolamento.

*   **Testes Unitários:**
    ```bash
    npm run test
    ```
*   **Cobertura de Testes:**
    ```bash
    npm run test:cov
    ```
*   **Testes End-to-End (E2E):**
    ```bash
    npm run test:e2e
    ```

### Estilo de Código

O projeto utiliza ESLint para linting e Prettier para formatação de código. Os arquivos de configuração são `eslint.config.js` e `.prettierrc`.

## Licença

Este projeto está sob a licença MIT.
