# Development Conventions

## Project Structure

The project follows a Clean Architecture approach with the following structure:

```
src/
├── auth/                   # Authentication module
│   ├── application/       # Use cases and controllers
│   ├── domain/           # Business rules and entities
│   ├── infrastructure/   # Technical implementations
│   └── dto/              # Data transfer objects
├── usuarios/              # Users module
├── perfis/               # Profiles module
├── permissoes/           # Permissions module
└── prisma/               # Prisma ORM configuration
```

### Architecture Layers

*   **Domain**: Contains business rules and entities
*   **Application**: Implement application use cases
*   **Infrastructure**: Handles technical aspects and frameworks
*   **DTOs**: Defines data transfer objects

## Testing

The project includes unit and end-to-end (E2E) tests. Tests are executed in a separate database to ensure isolation.

### Running Tests

*   **Unit Tests:**
    ```bash
    npm run test
    ```
*   **Test Coverage:
    ```bash
    npm run test:cov
    ```
*   **End-to-End (E2E) Tests:**
    E2E tests are executed against a separate database (`api-padrao-test`).
    1.  Execute migrations for the test database:
        ```bash
        npm run test:migrate
        ```
    2.  Run E2E tests:
        ```bash
        npm run test:e2e
        ```

## Code Style

The project uses ESLint for linting and Prettier for code formatting. Configuration files are `eslint.config.js` and `.prettierrc`.

## Development Guidelines

To ensure code quality, maintainability, and adherence to best practices, the following guidelines must be followed during development:

*   **Test-Driven Development (TDD):** All new features and bug fixes must be developed following the Test-Driven Development (TDD) methodology. Write tests before writing the production code.
*   **Clean Code Principles:** Adhere strictly to Clean Code principles, focusing on readability, maintainability, and simplicity.
*   **SOLID Principles:** Apply SOLID principles (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion) to design and implement robust, maintainable, and scalable solutions.
*   **Unit Test Coverage:** Unit test coverage must be equal to or greater than 80%. Ensure that new code maintains or improves this coverage.
*   **Pre-Commit Checks:**
    To ensure code quality and prevent regressions, pre-commit hooks are configured using Husky and lint-staged. These hooks automatically run checks on staged files before a commit is allowed.
    *   **Linting:** The linter (`eslint --fix`) is run on staged `.ts` and `.tsx` files. Any fixable issues will be automatically corrected. If unfixable errors remain, the commit will be aborted.
    *   **Unit Tests:** Relevant unit tests (`jest --findRelatedTests`) are run on staged `.ts` and `.tsx` files. If any tests fail, the commit will be aborted.
    *   **Passing Tests:** No code should be committed if any tests (unit or E2E) are failing. All tests must pass before committing.
    *   **Documentation Update:** Always update the project documentation (Swagger annotations and `README.md`) before committing.
*   **Test Message Language:** All descriptive messages within unit and integration tests (e.g., `describe` and `it` block descriptions) must be written in Brazilian Portuguese (pt-br).
*   **Pagination for List Searches:** All searches returning a list of objects must be paginated. The default page size should be 10. Pagination should support ordering, and the response must include the total number of pages and total number of elements.
*   **Entity Soft Delete:** All database entities must include `createdAt`, `updatedAt`, `deletedAt` fields, and a boolean flag named `ativo` (active). Deletion should be a soft delete, controlled by setting a value in the `deletedAt` field and setting `ativo` to `false`. If an entity has been deactivated (soft-deleted) at least once, its `deletedAt` field must contain a timestamp.
*   **Boas Práticas de Logging:**
    *   **Tipos de Logs:** Coletar logs de aplicação (DEBUG, INFO, WARN, ERROR, FATAL), logs de acesso, logs de auditoria, logs de sistema/infraestrutura, traces distribuídos e métricas.
    *   **Contexto:** Incluir sempre contexto relevante nos logs (ex: ID da requisição, ID do usuário, ID da sessão, nome do serviço, versão da aplicação).
    *   **Formato Estruturado:** Utilizar formato JSON para logs para facilitar ingestão, pesquisa e análise.
    *   **Centralização:** Enviar todos os logs para um sistema de gerenciamento de logs centralizado.
    *   **Correlação:** Garantir que logs, métricas e traces possam ser correlacionados (ex: usando IDs de trace do OpenTelemetry).
    *   **Níveis Apropriados:** Usar os níveis de log corretamente para gerenciar a verbosidade.
    *   **Não Logar Dados Sensíveis:** Nunca registrar informações sensíveis como senhas ou dados pessoais.

*   **Logging:**
    Para garantir logs estruturados e com contexto, utilize a biblioteca Pino integrada ao NestJS.
    1.  **Instalação:**
        ```bash
        npm install --save pino pino-pretty @nestjs/pino
        ```
    2.  **Configuração Básica no `AppModule`:**
        Importe `LoggerModule` e configure-o para usar o Pino. Exemplo:
        ```typescript
        import { Module } from '@nestjs/common';
        import { LoggerModule } from 'nestjs-pino';
        import { AppController } from './app.controller';
        import { AppService } from './app.service';

        @Module({
          imports: [
            LoggerModule.forRoot({
              pinoHttp: {
                transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
                level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
                formatters: {
                  level: (label) => { return { level: label.toUpperCase() }; }
                },
                // Adicionar contexto de OpenTelemetry (Trace ID, Span ID)
                // Isso requer configuração adicional para extrair IDs do contexto OpenTelemetry
                // e injetá-los nos logs. Pode ser feito com um custom serializer ou um hook.
                // Exemplo de customProps para adicionar traceId e spanId (requer integração com OpenTelemetry context):
                // customProps: (req, res) => ({ traceId: req.traceId, spanId: req.spanId }),
              },
            }),
          ],
          controllers: [AppController],
          providers: [AppService],
        })
        export class AppModule {}
        ```
    3.  **Uso em Serviços e Controllers:**
        Injete `Logger` do `@nestjs/common` e utilize seus métodos (`log`, `error`, `warn`, `debug`, `verbose`).
        ```typescript
        import { Injectable, Logger } from '@nestjs/common';

        @Injectable()
        export class MyService {
          private readonly logger = new Logger(MyService.name);

          doSomething() {
            this.logger.log('Fazendo algo...');
            this.logger.debug('Detalhes da operação...');
          }
        }
        ```
    4.  **Substituir `console.log`:**
        Substitua todas as ocorrências de `console.log`, `console.error`, etc., pelo logger configurado.

    5.  **Redação de Dados Sensíveis:**
        Configure o Pino para redigir dados sensíveis (senhas, tokens) dos logs. Exemplo de configuração no `pinoHttp`:
        ```typescript
        redact: {
          paths: ['req.headers.authorization', 'req.body.senha'],
          censor: '***REDACTED***'
        },
        ```

## Continuous Integration (CI)

A GitHub Actions workflow is configured to ensure code quality and prevent regressions on every pull request to the `main` branch. The CI pipeline performs the following checks:

*   **Linting:** Runs ESLint to enforce code style and identify potential issues.
*   **Unit Tests:** Executes all unit tests to verify the correctness of individual components.
*   **E2E Tests:** Runs end-to-end tests against a dedicated test database to ensure the application's overall functionality.
