# API Padrão

## Descrição do Projeto

Este projeto é uma API RESTful robusta e escalável, desenvolvida com NestJS, utilizando Prisma como ORM e PostgreSQL como banco de dados. A arquitetura segue princípios de Clean Architecture, garantindo modularidade, testabilidade e fácil manutenção. A API inclui módulos essenciais para autenticação, gerenciamento de usuários, perfis e permissões, fornecendo uma base sólida para diversas aplicações.

### Características Principais

*   **Autenticação Segura:** Implementação de autenticação JWT (JSON Web Tokens) para acesso seguro aos recursos da API.
*   **Gerenciamento de Usuários:** Funcionalidades completas para criação, leitura, atualização, **deleção lógica (soft delete) e restauração** de usuários, com suporte a múltiplos perfis.
*   **Perfis e Permissões:** Sistema granular de perfis e permissões, permitindo controle de acesso detalhado a diferentes funcionalidades da API, **incluindo deleção lógica (soft delete) e restauração de perfis e permissões**.
*   **Lógica de Hashing de Senha Abstraída:** A manipulação de senhas agora utiliza uma abstração (`PasswordHasher`), permitindo flexibilidade na escolha do algoritmo de hashing e melhorando a aderência ao Princípio da Inversão de Dependência (DIP).
*   **Lógica de Autorização Centralizada:** Extração da lógica de verificação de perfis (ex: `isAdmin`) para um serviço de autorização dedicado, promovendo maior aderência aos princípios SOLID (SRP e OCP).
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
│   ├── infrastructure/   # Implementações técnicas (inclui serviços de autorização)
│   └── dto/              # Objetos de transferência de dados
├── usuarios/              # Módulo de usuários
├── perfis/               # Módulo de perfis
├── permissoes/           # Módulo de permissões
├── shared/               # Módulos compartilhados (ex: abstrações de serviços e suas implementações)
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
    A cobertura de testes unitários atual é de **85.28%**, superando o requisito mínimo de 80%.
    ```bash
    npm run test:cov
    ```
*   **Testes End-to-End (E2E):**
    1.  Execute as migrações para o banco de dados de teste:
        ```bash
        npm run test:migrate
        ```
    2.  Execute os testes E2E:
        ```bash
        npm run test:e2e
        ```

### Estilo de Código

O projeto utiliza ESLint para linting e Prettier para formatação de código. Os arquivos de configuração são `eslint.config.js` e `.prettierrc`.

## Diretrizes de Desenvolvimento

Para garantir a qualidade do código, manutenibilidade e aderência às melhores práticas, as seguintes diretrizes devem ser seguidas durante o desenvolvimento:

*   **Desenvolvimento Orientado a Testes (TDD):** Todas as novas funcionalidades e correções de bugs devem ser desenvolvidas seguindo a metodologia Test-Driven Development (TDD). Escreva os testes antes de escrever o código de produção.
*   **Princípios de Clean Code:** Adira estritamente aos princípios de Clean Code, focando em legibilidade, manutenibilidade e simplicidade.
*   **Princípios SOLID:** Aplique os princípios SOLID (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion) para projetar e implementar soluções robustas, manuteníveis e escaláveis.
*   **Cobertura de Testes Unitários:** A cobertura de testes unitários deve ser igual ou superior a 80%. Garanta que o novo código mantenha ou melhore essa cobertura.
*   **Verificações de Pré-Commit:**
    Para garantir a qualidade do código e prevenir regressões, hooks de pré-commit são configurados usando Husky e lint-staged. Esses hooks executam automaticamente verificações em arquivos staged antes que um commit seja permitido.
    *   **Linting:** O linter (`eslint --fix`) é executado em arquivos `.ts` e `.tsx` staged. Quaisquer problemas corrigíveis serão automaticamente corrigidos. Se erros não corrigíveis permanecerem, o commit será abortado.
    *   **Testes Unitários:** Testes unitários relevantes (`jest --findRelatedTests`) são executados em arquivos `.ts` e `.tsx` staged. Se algum teste falhar, o commit será abortado.
    *   **Testes Aprovados:** Nenhum código deve ser commitado se quaisquer testes (unitários ou E2E) estiverem falhando. Todos os testes devem passar antes de commitar.
    *   **Atualização da Documentação:** Sempre atualize a documentação do projeto (anotações Swagger e `README.md`) antes de commitar.
*   **Linguagem das Mensagens de Teste:** Todas as mensagens descritivas dentro dos testes unitários e de integração (por exemplo, descrições dos blocos `describe` e `it`) devem ser escritas em Português do Brasil (pt-br).
*   **Paginação para Buscas de Lista:** Todas as buscas que retornam uma lista de objetos devem ser paginadas. O tamanho padrão da página deve ser 10. A paginação deve suportar ordenação, e a resposta deve incluir o número total de páginas e o número total de elementos.
*   **Soft Delete de Entidades:** Todas as entidades de banco de dados devem incluir os campos `createdAt`, `updatedAt`, `deletedAt`, e uma flag booleana chamada `ativo` (active). A exclusão deve ser um soft delete, controlada pela definição de um valor no campo `deletedAt` e definindo `ativo` como `false`. Se uma entidade foi desativada (soft-deleted) pelo menos uma vez, seu campo `deletedAt` deve conter um timestamp.

## Integração Contínua (CI)

Um workflow do GitHub Actions é configurado para garantir a qualidade do código e prevenir regressões em cada pull request para a branch `main`. O pipeline de CI realiza as seguintes verificações:

*   **Linting:** Executa o ESLint para impor o estilo do código e identificar potenciais problemas.
*   **Testes Unitários:** Executa todos os testes unitários para verificar a correção dos componentes individuais.
*   **Testes E2E:** Executa testes end-to-end contra um banco de dados de teste dedicado para garantir a funcionalidade geral da aplicação.

## Licença

Este projeto está sob a licença MIT.