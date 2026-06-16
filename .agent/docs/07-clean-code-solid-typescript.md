---
title: Clean Code e princípios SOLID para TypeScript/NestJS
description: Robert C. Martin, Uncle Bob, S.O.L.I.D., boas práticas TypeScript aplicadas ao NestJS
last_updated: 2026-06-15
reviewer: analista-backend
related:
  - 05-ddd-aplicado-nestjs.md
  - 06-arquitetura-hexagonal-nestjs.md
  - 08-performance-otimizacao-apis-nestjs.md
  - ../../AGENTS.md
---

# Clean Code e princípios SOLID para TypeScript/NestJS

> Documento de referência sobre **Clean Code** (Robert C. Martin, 2008),
> **S.O.L.I.D.**, e boas práticas de TypeScript aplicadas ao NestJS 11 do
> projeto `api-padrao`. Foco: como **reconhecer cheiro** (smells) e
> **refatorar com segurança** mantendo o workflow TDD.

## 1. Clean Code — essência

> *"Você sabe que está lendo código limpo quando cada rotina que você lê
> é quase tudo o que você esperava."* — Robert C. Martin

Clean Code **não é estética**. É um conjunto de **princípios pragmáticos**
que tornam o código:

- **Fácil de ler** (humanos passam mais tempo lendo do que escrevendo)
- **Fácil de mudar** (mudanças são localizadas e seguras)
- **Fácil de testar** (dependências injetadas, baixo acoplamento)
- **Fácil de estender** (sem mexer no que já funciona)

No TypeScript/Nest, isso se traduz em **8 regras de ouro**:

| # | Regra | Resumo |
|---|-------|--------|
| 1 | **Nomes revelam intenção** | `findByEmailWithPerfis` > `find` |
| 2 | **Funções pequenas** | < 20 linhas; **uma** responsabilidade |
| 3 | **Argumentos curtos** | 0-2 ideal; > 3 considere objeto |
| 4 | **Sem side-effects ocultos** | O nome diz o que faz, sem pegadinhas |
| 5 | **Comentários explicam "por quê"** | Não "o que" (o código já diz) |
| 6 | **Formatação consistente** | `npm run format` automatiza |
| 7 | **Tratamento de erro explícito** | Exceções tipadas, sem `try` engolido |
| 8 | **Testes limpos** | Testes são a documentação viva |

## 2. S.O.L.I.D. (com exemplos NestJS)

### S — Single Responsibility Principle (SRP)

> *Uma classe deve ter **um**, e somente **um**, motivo para mudar.*

```typescript
// ❌ Violação: o service conhece HTTP, banco, auditoria
@Injectable()
export class UsuariosService {
  async criar(dto: CreateUsuarioDto, res: Response) {
    const user = await this.prisma.usuario.create({ data: dto });
    res.status(201).json(user); // ← conhecimento de HTTP
    this.logger.log('criou');    // ← logging + auditoria
  }
}

// ✅ Correto: cada classe tem um motivo para mudar
@Injectable()
export class CriarUsuarioUseCase {
  constructor(
    private readonly userRepo: UsuarioRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly eventBus: EventBus,
  ) {}
  async execute(input: { email: string; senha: string }): Promise<Usuario> {
    const senhaHash = await this.passwordHasher.hash(input.senha);
    const user = Usuario.criar({ email: input.email, senhaHash });
    await this.userRepo.save(user);
    await this.eventBus.publish(new UsuarioCriadoEvent(user.id));
    return user;
  }
}
```

**Detector**: "eu consigo descrever o que essa classe faz em **uma frase** sem
usar 'e'?" Se não, está violando SRP.

### O — Open/Closed Principle (OCP)

> *Aberto para extensão, fechado para modificação.*

```typescript
// ❌ Toda vez que aparece um novo perfil, o if cresce
if (user.role === 'admin') { /* ... */ }
else if (user.role === 'gerente') { /* ... */ }
else if (user.role === 'auditor') { /* ... */ }

// ✅ Strategy / Decorator
interface ICalculaDesconto {
  calcular(valor: number): number;
}
class DescontoAdmin implements ICalculaDesconto { calcular(v: number) { return v * 0.2; } }
class DescontoGerente implements ICalculaDesconto { calcular(v: number) { return v * 0.1; } }
// Para adicionar "auditor": cria a classe; zero mudança no consumidor
```

**No projeto**: o `DefaultAuthorizationService` é um bom candidato a
Strategy. Se amanhã aparecer `RoleBasedAuthorizationService`,
estende-se **sem** mexer no `PermissaoGuard`.

### L — Liskov Substitution Principle (LSP)

> *Subtipos devem ser substituíveis por seus tipos base sem quebrar o sistema.*

```typescript
// ❌ Subtipo que viola o contrato da base
class Cpf {
  validar(cpf: string): boolean { return /* ... */ true; }
}
class CpfEstrangeiro extends Cpf {
  validar(cpf: string): boolean { throw new Error('Não aplicável'); }
}

// ✅ Se a subclasse não pode honrar o contrato, ela não é subtipo
// Solução: classe base mais ampla
abstract class Identificador { abstract validar(s: string): boolean; }
class Cpf extends Identificador { /* só CPF */ }
class DocumentoEstrangeiro extends Identificador { /* passaporte etc */ }
```

**No projeto**: o `PasswordHasher` (interface no domain) é honrado por
`BcryptPasswordHasherService` (infra). Se um dia criar
`Argon2PasswordHasherService`, **deve** honrar o contrato (hash → compare
retorna `boolean`, etc.).

### I — Interface Segregation Principle (ISP)

> *Muitas interfaces específicas são melhores que uma interface geral.*

```typescript
// ❌ Deus-interface
interface Repository<T> {
  save(entity: T): Promise<T>;
  update(entity: T): Promise<T>;
  delete(id: any): Promise<void>;
  findById(id: any): Promise<T>;
  findAll(): Promise<T[]>;
  search(criteria: any): Promise<T[]>;
  count(criteria?: any): Promise<number>;
  // ... 20 métodos
}

// ✅ Interfaces segregadas
interface ReadRepository<T, ID> {
  findById(id: ID): Promise<T | null>;
  list(criteria: ListCriteria<T>): Promise<Paginated<T>>;
}
interface WriteRepository<T, ID> {
  save(entity: T): Promise<T>;
  delete(id: ID): Promise<void>;
}
// O use case depende só do que usa
```

**No projeto**: `UsuarioRepository` está bem granular; mas atenção a
futuras "super-interfaces" no `shared/`.

### D — Dependency Inversion Principle (DIP)

> *Módulos de alto nível não devem depender de módulos de baixo nível.
> Ambos devem depender de **abstrações**.*

Este é o **coração** do Hexagonal. No Nest:

```typescript
// ❌ Service depende do Prisma (detalhe de infra)
constructor(private prisma: PrismaService) {}

// ✅ Service depende de porta (abstração)
constructor(private userRepo: UsuarioRepository) {}
// Onde UsuarioRepository é interface no domain/, e
// PrismaUsuarioRepository (infra) é quem implementa
```

**Detector**: `grep -R "private prisma\|this.prisma\." src/<m>/application/`.
Se aparecer, está violando DIP.

## 3. Outros princípios importantes

### DRY — Don't Repeat Yourself

> *Todo pedaço de conhecimento deve ter uma **representação única**,
> **autoritativa** e **sem ambiguidade** no sistema.*

**Aplicação prática no projeto**:
- DTOs repetidos → `@nestjs/mapped-types` (`PartialType`, `PickType`)
- Lógica de paginação → `PaginationDto` + `PaginatedResponseDto` (já existe)
- Validação de e-mail → VO `Email` (a criar) em vez de `IsEmail()` espalhado

### KISS — Keep It Simple, Stupid

> *A solução mais simples que resolve o problema é a melhor.*

**Armadilhas comuns**:
- Abstração prematura ("e se um dia trocarmos de ORM?")
- Pattern gold-plating (Decorator, Factory, Strategy sem motivo)
- Helper genérico "para tudo"

**No projeto**: o `BcryptPasswordHasherService` é um ótimo exemplo de
KISS: uma interface, uma implementação, sem over-engineering.

### YAGNI — You Aren't Gonna Need It

> *Não implemente algo até que seja **necessário**.*

- Event bus? Quando precisar (≥ 2 consumidores reais)
- CQRS? Quando a leitura for muito diferente da escrita
- Saga? Quando o fluxo multi-passo for real (não hipotético)
- Microserviço? Quando o monolito **realmente** doer

**No projeto**: cuidado com `CacheModule.registerAsync`, Bull, OpenTelemetry
— **bom** que existem, mas valide se estão **sendo usados**. Instrumentação
sem leitura é custo sem benefício.

### Law of Demeter (Princípio do Menor Conhecimento)

> *Uma classe só deve falar com **amigos próximos** — não com
> "amigos de amigos".*

```typescript
// ❌ a.b.c.d() — cadeia que atravessa objetos
const empresaNome = usuario.empresas[0].empresa.nome;

// ✅ Encapsule — o dominio expõe o que importa
const empresa = usuario.empresaPrincipal(); // método da entidade
const nome = empresa.nome;
```

**No projeto**: o `AuthService` tem `user.empresas.map((ue) => ue.empresaId)`
— isso é um **code smell** de Demeter. A entidade `Usuario` deveria expor
um método `getEmpresaIds()` ou similar.

## 4. Boas práticas TypeScript específicas

### 4.1 Tipos estritos (sem `any`)

```typescript
// ❌ any — perde a checagem estática
const mappedEmpresas = empresas?.map((ue: any) => ({ ... }));

// ✅ tipo explícito
interface UsuarioEmpresaMapping {
  id: string;
  perfis: PerfilMapping[];
}
const mappedEmpresas: UsuarioEmpresaMapping[] = empresas.map((ue) => ({
  id: ue.empresaId,
  perfis: ue.perfis.map(perfilMapper.toMapping),
}));
```

**Regra do projeto**: `any` só com comentário `// eslint-disable-next-line` +
justificativa. **Hoje o `auth.service.ts:56-68` usa `any` — gap a tratar.**

### 4.2 `readonly` por padrão

```typescript
// ✅ Propriedades imutáveis
export class Usuario {
  constructor(
    public readonly id: number,
    public readonly email: string,
    public readonly ativo: boolean,
    public readonly deletedAt: Date | null,
  ) {}
  // MUDANÇAS viram NOVO objeto
  restaurar(): Usuario {
    return new Usuario(this.id, this.email, true, null);
  }
}
```

**No projeto**: hoje as entidades mutam (`user.ativo = true; user.deletedAt = null`).
Refatorar para imutável é o **próximo salto** (DDD rico + testes determinísticos).

### 4.3 Enums vs Union Types

```typescript
// ❌ Enum do TypeScript (não compila bem em alguns bundlers, e tree-shaking ruim)
enum Status { Ativo, Inativo }

// ✅ String union (mesma checagem, melhor tree-shaking, melhor DX)
type Status = 'ativo' | 'inativo';
```

**No projeto**: não há `enum` no `schema.prisma` (apenas `Boolean ativo`).
Preferir string unions em DTOs com `@IsEnum()` ou similar.

### 4.4 Tratamento de erro

```typescript
// ❌ Erro genérico
throw new Error('Falhou');

// ❌ Engolir erro
try { await ... } catch (e) {}

// ✅ Erro tipado + mensagem útil
throw new DomainError('USUARIO_JA_ATIVO', 'Usuário já está ativo e não foi excluído.');
// E o AllExceptionsFilter mapeia para a resposta HTTP apropriada
```

**No projeto**: criar `domain/errors/DomainError.ts` com códigos (ex.:
`USUARIO_NAO_ENCONTRADO`, `EMAIL_DUPLICADO`, `SENHA_FRACA`).

### 4.5 Evite `null` quando "ausente" é mais claro

```typescript
// ❌ null pode ser "ainda não carregado" OU "não existe"
function findById(id: number): Usuario | null {}

// ✅ Considere Optional/Maybe pattern (ou comentário)
function findById(id: number): Promise<Usuario | undefined> {}
```

**Regra**: seja **explícito** no tipo e no nome do método. `findById` → pode
não achar. `getById` (sem prefixo "find") → espera-se que existe.

## 5. Clean Code em NestJS — padrões práticos

### 5.1 Controllers magros

```typescript
// ✅ Controller só traduz HTTP → use case
@Post('login')
@Public()
@HttpCode(HttpStatus.OK)
@Throttle({ sensitive: { ttl: 60000, limit: 10 } })
async login(
  @Body() dto: LoginUsuarioDto,
  @Req() req: FastifyRequest,
): Promise<LoginResponseDto> {
  return this.authService.login(dto, req.ip, req.headers['user-agent']);
}
```

### 5.2 DTOs com `class-validator`

```typescript
// ✅ DTO na entrada HTTP — nunca aceita campos a mais
export class CreateUsuarioDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt limita em 72 bytes
  @Matches(/[A-Z]/, { message: 'senha deve ter ao menos 1 maiúscula' })
  senha!: string;
}
```

**Pipeline global** (em `main.ts`) já tem `whitelist: true` +
`forbidNonWhitelisted: true` — campos extras são **rejeitados**, não ignorados.

### 5.3 Module = composition root

```typescript
// ✅ <modulo>.module.ts é a "cola" — único lugar que conhece o concreto
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [
    {
      provide: USER_REPOSITORY, // token do domain
      useClass: PrismaUserRepository, // impl do infra
    },
    CriarUsuarioUseCase,
  ],
  controllers: [UsuarioController],
})
export class UsuarioModule {}
```

### 5.4 Injeção por interface (tokens)

```typescript
// domain/repositories/usuario.repository.ts
export const USUARIO_REPOSITORY = Symbol('USUARIO_REPOSITORY');
export interface UsuarioRepository { /* ... */ }
```

Use **símbolo** (ou string) como token de DI. Facilita mock em testes:

```typescript
// usuarios.service.spec.ts
const mockRepo: jest.Mocked<UsuarioRepository> = {
  findById: jest.fn(),
  save: jest.fn(),
  // ...
};
Test.createTestingModule({
  providers: [
    UsuariosService,
    { provide: USUARIO_REPOSITORY, useValue: mockRepo },
  ],
}).compile();
```

## 6. Code Smells — checklist de varredura

Use este checklist ao revisar PRs:

| Smell | Detector | Ação |
|-------|----------|------|
| **Função longa** | `> 30 linhas` | Extrair |
| **Parâmetros demais** | `> 3` argumentos | Objeto de input |
| **Anemic Entity** | Só `get`/`set`; regra no service | Mover regra para entidade |
| **Feature Envy** | Método usa mais outra classe que a sua | Mover método |
| **Primitive Obsession** | `string` para e-mail, `number` para cnpj | Value Object |
| **Long Method Chain** | `a.b().c().d().e()` | Encapsular |
| **Speculative Generality** | "e se um dia..." | YAGNI — apagar |
| **Dead Code** | Métodos/classes não usados | Apagar |
| **Commentário redundante** | `// soma x + y` ao lado de `x + y` | Apagar comentário |
| **Mensagem de erro genérica** | `throw new Error('...')` | Tipar e detalhar |
| **Try vazio** | `try { } catch {}` | Tratar ou propagar |
| **`any` sem justificativa** | `grep "any" src/` | Tipar |
| **Mutação compartilhada** | Argumento mutado dentro de método | Imutabilidade |

## 7. Métricas e limites (orientativos)

| Métrica | Limite saudável | Como medir |
|---------|---------------|-----------|
| Linhas por arquivo | < 300 | `cloc` ou `wc -l` |
| Linhas por método | < 30 | ESLint `max-lines-per-function` |
| Parâmetros por método | ≤ 3 | ESLint `max-params` |
| Complexidade ciclomática | < 10 | `eslint-plugin-complexity` |
| Acoplamento (deps de uma classe) | ≤ 7 | análise estática |
| Coesão (LCOM4) | > 0.5 | análise estática |
| `any` por arquivo | 0 | `grep -c "any" <file>` |
| `// eslint-disable` | 0 sem justificativa | `grep "eslint-disable" src/` |

**Configurar ESLint** com:
- `@typescript-eslint/no-explicit-any: error`
- `@typescript-eslint/explicit-function-return-type: warn`
- `max-lines-per-function: ['error', { max: 30, skipComments: true }]`
- `max-params: ['error', { max: 3 }]`

## 8. Clean Code em testes

> *"Os testes são a primeira (e muitas vezes única) documentação viva do
> sistema. Trate-os com o mesmo cuidado que o código de produção."*

- Nome de teste descreve **comportamento**: `deve restaurar usuário quando ativo era false` ✓
- Arrange-Act-Assert visível
- 1 assertiva conceitual por teste (múltiplos `expect` do mesmo objeto OK)
- Sem `if` no teste
- Sem dependência de ordem
- Sem sleep/`setTimeout` real

## 9. Referências

- Robert C. Martin — *Clean Code: A Handbook of Agile Software Craftsmanship* (2008)
- Robert C. Martin — *Clean Architecture* (2017)
- Sandi Metz — *Practical Object-Oriented Design in Ruby* (2012, 99% aplicável a TS)
- Kent Beck — *Implementation Patterns* (2007)
- Refactoring Guru — *Refactoring* (refactoring.guru)
- TypeScript Handbook — [typescriptlang.org/docs](https://www.typescriptlang.org/docs/handbook/)
- Google TypeScript Style Guide
- [`.agent/docs/05-ddd-aplicado-nestjs.md`](./05-ddd-aplicado-nestjs.md)
- [`.agent/docs/06-arquitetura-hexagonal-nestjs.md`](./06-arquitetura-hexagonal-nestjs.md)
- [AGENTS.md §5 — Convenções](../../AGENTS.md#5-convenções)
