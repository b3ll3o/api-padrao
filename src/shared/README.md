# Módulo Compartilhado (`shared`)

Contém utilitários, decoradores, filtros e serviços que são utilizados por múltiplos módulos da aplicação.

## Componentes Principais

### 1. Contexto de Empresa (`EmpresaContext`)
- **Tipo**: Request-scoped Service.
- **Função**: Armazena o `empresaId` e `usuarioId` da requisição atual. Permite que serviços de domínio acessem o contexto sem depender de parâmetros manuais.

### 2. Interceptor de Empresa (`EmpresaInterceptor`)
- **Função**: Extrai o `empresaId` do header `x-empresa-id` ou do payload do JWT e popula o `EmpresaContext`.

### 3. Filtro Global de Exceções (`AllExceptionsFilter`)
- **Função**: Captura todos os erros da aplicação e os formata em um padrão JSON consistente.

### 4. Decoradores Customizados
- `@UsuarioLogado()`: Extrai os dados do usuário do JWT.
- `@EmpresaId()`: Extrai o ID da empresa do contexto da requisição.

### 5. Hasher de Senha
- Interface `PasswordHasher` e implementação `BcryptPasswordHasherService` para garantir segurança uniforme nas senhas.

## DTOs Globais
- `PaginationDto`: Padronização para todos os endpoints de listagem.
- `PaginatedResponseDto`: Estrutura padrão de resposta para listas (contendo `data`, `total`, `page`, `limit`, `totalPages`).
