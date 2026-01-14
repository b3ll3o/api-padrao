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
├── empresas/              # Companies module (Multi-tenancy core)
├── usuarios/              # Users module
├── perfis/                # Profiles module (Company-scoped)
├── permissoes/            # Permissions module
├── shared/                # Shared utilities, decorators, filters, and interceptors
└── prisma/                # Prisma ORM configuration
```

### Architecture Layers

*   **Domain**: Contains business rules and entities. Database entities should use `class-transformer` decorators (like `@Exclude()`) for security.
*   **Application**: Implement application use cases and controllers. Use custom decorators for clean parameter injection.
*   **Infrastructure**: Handles technical aspects, frameworks, and repository implementations.
*   **DTOs**: Defines data transfer objects with strict validation using `class-validator`.

## Testing

The project includes unit and end-to-end (E2E) tests. Tests are executed in a separate database to ensure isolation.

### Running Tests

*   **Unit Tests:** `npm run test`
*   **End-to-End (E2E) Tests:** `npm run test:e2e` (Ensure `npm run test:migrate` is run before).

## Code Style & Standards

### 1. Custom Decorators
Use custom decorators to access request context instead of raw `@Req()`.
*   `@UsuarioLogado()`: Injects the `JwtPayload` of the authenticated user.
*   `@EmpresaId()`: Injects the current company ID from the `x-empresa-id` header.

### 2. Data Security
*   **Never** manually delete sensitive fields (like `delete user.password`) in services.
*   Use `@Exclude()` in the Entity class and ensure `ClassSerializerInterceptor` is registered globally.

### 3. Global Error Handling
*   All errors are intercepted by `AllExceptionsFilter`.
*   Standard error format: `{ statusCode, timestamp, path, message }`.

### 4. Logging
*   Use `LoggingInterceptor` for automatic HTTP request logging (Method, URL, Status, Latency).
*   Use the standard `Logger` from `@nestjs/common` for manual logs within services.

### 5. Pagination
*   All list endpoints **must** be paginated using `PaginationDto`.
*   Default limit: 10.

### 6. Entity Soft Delete
*   All database entities must include `createdAt`, `updatedAt`, `deletedAt` fields, and an `ativo` boolean flag.
*   Deletions must be logical (soft delete).

## Development Guidelines

*   **Test-Driven Development (TDD):** Write tests before production code.
*   **Clean Code & SOLID:** Adhere strictly to these principles for maintainability.
*   **Pre-Commit Checks:** Husky runs Linting and Unit Tests on staged files. Do not bypass these checks.
*   **Documentation Update:** Always update Swagger annotations and `README.md` when changing API contracts or architecture.

## Continuous Integration (CI)

A GitHub Actions workflow (`ci.yml`) runs Linting, Unit Tests, and E2E Tests on every PR to `main`.