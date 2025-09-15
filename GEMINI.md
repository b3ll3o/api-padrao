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
*   **Test Coverage:**
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
    *   **Passing Tests:** No code should be committed if any tests (unit or E2E) are failing. All tests must pass before committing.
    *   **Linting:** The linter must be run and pass without errors or warnings before every commit.
    *   **Documentation Update:** Always update the project documentation (Swagger annotations and `README.md`) before committing.
*   **Test Message Language:** All descriptive messages within unit and integration tests (e.g., `describe` and `it` block descriptions) must be written in Brazilian Portuguese (pt-br).
*   **Pagination for List Searches:** All searches returning a list of objects must be paginated. The default page size should be 10. Pagination should support ordering, and the response must include the total number of pages and total number of elements.
*   **Entity Soft Delete:** All database entities must include `createdAt`, `updatedAt`, and `deletedAt` fields. Deletion should be a soft delete, controlled by setting a value in the `deletedAt` field. If an entity has been deactivated (soft-deleted) at least once, its `deletedAt` field must contain a timestamp.