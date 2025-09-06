# API Padrão

## Descrição do Projeto

Este projeto é uma API RESTful desenvolvida com NestJS, utilizando Prisma como ORM e PostgreSQL como banco de dados. A API inclui um módulo de autenticação com JWT e um módulo de gerenciamento de usuários.

## Tecnologias Utilizadas

*   **Framework:** NestJS
*   **Linguagem:** TypeScript
*   **ORM:** Prisma
*   **Banco de Dados:** PostgreSQL
*   **Autenticação:** JWT (JSON Web Tokens)
*   **Containerização:** Docker / Podman

## Configuração do Ambiente

### Pré-requisitos

Certifique-se de ter as seguintes ferramentas instaladas em sua máquina:

*   Node.js (versão 20.x ou superior)
*   npm (gerenciador de pacotes do Node.js)
*   Docker ou Podman (para o banco de dados PostgreSQL)

### Instalação

1.  Clone o repositório:
    ```bash
    git clone <URL_DO_REPOSITORIO>
    cd api-padrao
    ```
2.  Instale as dependências do projeto:
    ```bash
    npm install
    ```

### Configuração do Banco de Dados

1.  Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis de ambiente:
    ```
    POSTGRES_USER=postgres
    POSTGRES_PASSWORD=postgres
    POSTGRES_DB=api-padrao
    PGADMIN_DEFAULT_EMAIL=admin@admin.com
    PGADMIN_DEFAULT_PASSWORD=admin
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/api-padrao"
    ```
    *Nota: Você pode alterar os valores conforme sua preferência.*

2.  Inicie o contêiner do PostgreSQL e pgAdmin (se estiver usando Docker/Podman Compose):
    ```bash
    docker-compose up -d # ou podman-compose up -d
    ```

3.  Execute as migrações do Prisma para criar o schema do banco de dados:
    ```bash
    npx prisma migrate dev
    ```

## Executando a Aplicação

### Modo de Desenvolvimento

```bash
npm run start:dev
```
A aplicação estará disponível em `http://localhost:3000` (ou na porta configurada na variável de ambiente `PORT`).

### Modo de Produção

```bash
npm run build
npm run start:prod
```

## Executando Testes

### Testes Unitários

```bash
npm run test
```

### Testes End-to-End (E2E)

Os testes E2E são executados em um banco de dados separado (`api-padrao-test`).

1.  Execute as migrações para o banco de dados de teste:
    ```bash
    npm run test:migrate
    ```
2.  Execute os testes E2E:
    ```bash
    npm run test:e2e
    ```

## Endpoints da API

### Autenticação

*   **`POST /auth/login`**: Autentica um usuário e retorna um JWT.
    *   **Request Body:**
        ```json
        {
          "email": "user@example.com",
          "senha": "Password123!"
        }
        ```
    *   **Response (Success):**
        ```json
        {
          "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        }
        ```
    *   **Response (Failure - 401 Unauthorized):**
        ```json
        {
          "statusCode": 401,
          "message": "Credenciais inválidas",
          "error": "Unauthorized"
        }
        ```

### Usuários

*   **`POST /usuarios`**: Cria um novo usuário.
    *   **Request Body:**
        ```json
        {
          "email": "newuser@example.com",
          "senha": "Password123!"
        }
        ```
    *   **Response (Success - 201 Created):**
        ```json
        {
          "id": 1,
          "email": "newuser@example.com",
          "createdAt": "2023-10-27T10:00:00.000Z",
          "updatedAt": "2023-10-27T10:00:00.000Z"
        }
        ```
    *   **Response (Failure - 409 Conflict):**
        ```json
        {
          "statusCode": 409,
          "message": "Usuário com este email já cadastrado",
          "error": "Conflict"
        }
        ```
    *   **Response (Failure - 400 Bad Request):**
        ```json
        {
          "statusCode": 400,
          "message": [
            "E-mail inválido",
            "A senha deve ter no mínimo 8 caracteres",
            "A senha deve conter pelo menos uma letra maiúscula, uma minúscula, um número ou um caractere especial"
          ],
          "error": "Bad Request"
        }
        ```

## Licença

Este projeto está sob a licença MIT.