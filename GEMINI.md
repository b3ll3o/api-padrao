# Project Overview

This project is a RESTful API developed with NestJS, using Prisma as the ORM and PostgreSQL as the database. The API includes authentication modules with JWT, user management, profiles, and permissions.

## Key Features

*   JWT authentication with profiles and permissions
*   User management with multiple profiles
*   Profiles with unique code and detailed description
*   Permissions with unique code and detailed description
*   Pagination system for listings
*   Complete documentation with Swagger/OpenAPI

## Technologies Used

*   **Framework:** NestJS (v11.1.6)
*   **Language:** TypeScript (v5.6.2)
*   **ORM:** Prisma (v6.15.0)
*   **Database:** PostgreSQL
*   **Authentication:** JWT (JSON Web Tokens)
*   **Documentation:** Swagger/OpenAPI (v5.0)
*   **Containerization:** Docker
*   **Validation:** class-validator (v0.14.2)
*   **Transformation:** class-transformer (v0.5.1)

# Building and Running

## Prerequisites

*   Node.js (version 20.x or higher)
*   npm (Node.js package manager)
*   Docker (for PostgreSQL database)
*   Git (for version control)

## Installation

1.  Clone the repository:
    ```bash
    git clone <URL_DO_REPOSITORIO> # Replace with actual repository URL
    cd api-padrao
    ```
2.  Install project dependencies:
    ```bash
    npm install
    ```

## Database Configuration

1.  Create a `.env` file in the project root with the following environment variables:
    ```
    POSTGRES_USER=postgres
    POSTGRES_PASSWORD=postgres
    POSTGRES_DB=api-padrao
    PGADMIN_DEFAULT_EMAIL=admin@admin.com
    PGADMIN_DEFAULT_PASSWORD=admin
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/api-padrao"
    ```
    *Note: You can change the values as per your preference.*

2.  Start the PostgreSQL and pgAdmin containers (if using Docker/Podman Compose):
    ```bash
    docker-compose up -d
    ```

3.  Execute Prisma migrations to create the database schema:
    ```bash
    npx prisma migrate dev
    ```

## Running the Application

### Development Mode

```bash
npm run start:dev
```
The application will be available at `http://localhost:3000` (or the port configured in the `PORT` environment variable).

### Production Mode

```bash
npm run build
npm run start:prod
```

## API Documentation (Swagger)

Interactive API documentation is available via Swagger UI.
After starting the application, access: `http://localhost:3000/swagger`

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
