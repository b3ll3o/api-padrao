# Auth Module Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir a cobertura de testes do módulo `auth` (NestJS 11) para >= 90% em todas as 4 métricas (statements, branches, functions, lines), sem alterar código de produção.

**Architecture:** Apenas adições de testes. Ondas de 4 commits, cada uma focando em um subconjunto de arquivos. Unitários mockam as **portas** (interfaces de domínio) seguindo o padrão DIP já estabelecido no projeto. E2E usa Postgres + Redis via `docker compose`.

**Tech Stack:** NestJS 11, Jest 30, Prisma 6, Supertest, Fastify, Redis (cache-manager-redis-yet), class-validator.

**Spec de referência:** [docs/superpowers/specs/2026-06-16-auth-test-coverage-design.md](../../specs/2026-06-16-auth-test-coverage-design.md)

---

## Convenções do Projeto (NÃO MUDAR)

- **Factories de domínio**: `makeUsuario`, `makePerfil`, `makePermissao` (ver [auth.service.spec.ts:27-55](../../../src/auth/application/services/auth.service.spec.ts) para o padrão).
- **Mocks de portas**: nunca mockar `PrismaService` diretamente; usar as interfaces de domínio (`UsuarioRepository`, `RefreshTokenRepository`, etc.).
- **Comentário BDD**: cada `it()` recebe `// BDD: features/autenticacao.feature:Cenário: ...` ou `// SDD: .openspec/changes/...` no início.
- **Co-localização**: unitários em `src/auth/**`, e2e em `test/`.
- **E2E setup**: `beforeAll` (cria app), `afterAll` (fecha app), `beforeEach` (`cleanDatabase(prisma)`). Reaproveitar [`test/e2e-utils.ts`](../../../test/e2e-utils.ts) — não recriar fixtures.
- **Validação por onda**: `npm run lint && npm run test -- src/auth && npm run test:cov` (verificar saída de cobertura para `src/auth/`) e `npm run test:e2e -- --testPathPattern=auth` antes de commitar.

---

## Tarefa 0: Baseline de Cobertura

**Files:**
- Read: `coverage/lcov-report/index.html` (gerado por `npm run test:cov`)

- [ ] **Step 1: Rodar cobertura atual**

Run: `npm run test:cov`

Expected: arquivo `coverage/lcov-report/index.html` é gerado. Anote a porcentagem global (statements, branches, functions, lines) e a porcentagem para cada arquivo de `src/auth/`.

- [ ] **Step 2: Listar arquivos auth abaixo de 90%**

```bash
# Abre o index.html e navega até src/auth/
# Anote os arquivos que estão abaixo de 90% em qualquer métrica
```

Expected: lista de arquivos candidatos a receber testes. Esses serão o foco principal das ondas seguintes.

- [ ] **Step 3: Sem commit (apenas medição)**

Esta tarefa é read-only. Sem commit. Use a saída para confirmar que o alvo de 90% exige as ondas 1-4 descritas na spec.

---

## Onda 1: Login + Refresh

### Tarefa 1.1: Adicionar testes de borda no `AuthService.login`

**Files:**
- Modify: `src/auth/application/services/auth.service.spec.ts` (adicionar 5 novos `it()` no `describe('login')`)

- [ ] **Step 1: Adicionar teste "user.senha é null"**

No arquivo [src/auth/application/services/auth.service.spec.ts](../../../src/auth/application/services/auth.service.spec.ts), dentro do `describe('login')` (antes do `it('deve limpar o contador de falhas...')`), adicione:

```typescript
    it('deve lançar UnauthorizedException se user.senha for null', async () => {
      const mockUser = makeUsuario({ id: 1, empresas: [] });
      // Sobrescreve senha para null
      Object.assign(mockUser, { senha: null });
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        mockUser,
      );
      mockPasswordHasher.compare.mockResolvedValue(false);

      const loginDto = { email: 'test@example.com', senha: 'qualquer' };

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPasswordHasher.compare).not.toHaveBeenCalled();
    });

    it('deve lançar UnauthorizedException se user.senha for undefined', async () => {
      const mockUser = makeUsuario({ id: 1, empresas: [] });
      Object.assign(mockUser, { senha: undefined });
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        mockUser,
      );

      const loginDto = { email: 'test@example.com', senha: 'qualquer' };

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se dto.senha for vazio', async () => {
      const mockUser = makeUsuario({ id: 1, empresas: [] });
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        mockUser,
      );

      // Forçamos bypass do DTO para testar a guarda do service
      const loginDto = {
        email: 'test@example.com',
        senha: '' as unknown as string,
      };

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPasswordHasher.compare).not.toHaveBeenCalled();
    });

    it('deve chamar findByEmailWithPerfisAndPermissoes antes de recordFailure em falha', async () => {
      const mockUser = makeUsuario({ id: 1, empresas: [] });
      Object.assign(mockUser, { senha: null });
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        mockUser,
      );

      await expect(
        service.login({ email: 'test@example.com', senha: 'qualquer' }),
      ).rejects.toThrow(UnauthorizedException);

      const findOrder =
        mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mock
          .invocationCallOrder[0];
      const recordOrder =
        mockLoginAttemptTracker.recordFailure.mock.invocationCallOrder[0];
      expect(findOrder).toBeLessThan(recordOrder);
    });

    it('deve chamar LoginHistory.record com undefined quando ip e userAgent não são fornecidos', async () => {
      const mockUser = makeUsuario({ id: 1, empresas: [] });
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        mockUser,
      );
      mockPasswordHasher.compare.mockResolvedValue(true);
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);
      mockLoginHistoryRepository.record.mockResolvedValue(undefined);

      await service.login({ email: 'test@example.com', senha: 'senha' });

      expect(mockLoginHistoryRepository.record).toHaveBeenCalledWith({
        userId: 1,
        ip: undefined,
        userAgent: undefined,
      });
    });
```

- [ ] **Step 2: Rodar os novos testes**

Run: `npm run test -- src/auth/application/services/auth.service.spec.ts`

Expected: 5 testes novos passam, junto com os anteriores. Os 5 testes verdes confirmam que o serviço trata as bordas corretamente.

- [ ] **Step 3: Sem commit (ainda falta a onda completa)**

Continuar para a próxima tarefa.

---

### Tarefa 1.2: Adicionar testes diretos para `AuthService.generateTokens`

**Files:**
- Modify: `src/auth/application/services/auth.service.spec.ts` (adicionar novo `describe('generateTokens')`)

- [ ] **Step 1: Adicionar describe `generateTokens` no spec**

No arquivo [src/auth/application/services/auth.service.spec.ts](../../../src/auth/application/services/auth.service.spec.ts), **após o `describe('refreshTokens')`** (linha ~350), adicione:

```typescript
  describe('generateTokens', () => {
    it('deve gerar tokens com empresas como array vazio quando undefined', async () => {
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      const result = await service.generateTokens(1, 'user@e.com', undefined);

      expect(result.access_token).toBe('mockAccessToken');
      expect(result.refresh_token).toBeDefined();

      // Verifica que o JWT foi assinado com payload { sub, email, empresas: [] }
      const signCall = mockJwtService.sign.mock.calls[0][0];
      expect(signCall).toEqual({
        sub: 1,
        email: 'user@e.com',
        empresas: [],
      });
    });

    it('deve gerar tokens com empresas como array vazio quando vazio', async () => {
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      await service.generateTokens(1, 'user@e.com', []);

      const signCall = mockJwtService.sign.mock.calls[0][0];
      expect(signCall.empresas).toEqual([]);
    });

    it('deve mapear empresas com perfis e permissões para o shape do JWT', async () => {
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      const empresas = [
        {
          empresaId: 'emp-1',
          perfis: [
            {
              codigo: 'ADMIN',
              permissoes: [{ codigo: 'READ_X' }, { codigo: 'WRITE_X' }],
            },
          ],
        },
      ] as any;

      await service.generateTokens(42, 'user@e.com', empresas);

      const signCall = mockJwtService.sign.mock.calls[0][0];
      expect(signCall.empresas).toEqual([
        {
          id: 'emp-1',
          perfis: [
            {
              codigo: 'ADMIN',
              permissoes: [{ codigo: 'READ_X' }, { codigo: 'WRITE_X' }],
            },
          ],
        },
      ]);
    });

    it('deve usar fallback de 7 dias quando JWT_REFRESH_EXPIRES_DAYS não está configurado', async () => {
      // Reconfigura o mock para não retornar JWT_REFRESH_EXPIRES_DAYS
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'JWT_ACCESS_EXPIRES_IN') return '60s';
        if (key === 'JWT_REFRESH_EXPIRES_DAYS') return undefined;
        return null;
      });
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      const before = Date.now();
      await service.generateTokens(1, 'user@e.com', []);
      const after = Date.now();

      const createCall = mockRefreshTokenRepository.create.mock.calls[0][0];
      const expiresAt: Date = createCall.expiresAt;
      // 7 dias = 7 * 24 * 60 * 60 * 1000 ms
      const expectedMs = 7 * 24 * 60 * 60 * 1000;
      const lower = before + expectedMs - 1000;
      const upper = after + expectedMs + 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(lower);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(upper);
    });

    it('deve passar expiresIn undefined ao jwtService.sign quando JWT_ACCESS_EXPIRES_IN não está configurado', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'JWT_ACCESS_EXPIRES_IN') return undefined;
        if (key === 'JWT_REFRESH_EXPIRES_DAYS') return 7;
        return null;
      });
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      await service.generateTokens(1, 'user@e.com', []);

      const signOptions = mockJwtService.sign.mock.calls[0][1];
      expect(signOptions.expiresIn).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Rodar testes do `generateTokens`**

Run: `npm run test -- src/auth/application/services/auth.service.spec.ts -t "generateTokens"`

Expected: 5 testes passam. Os asserts validam o shape do JWT (`{ sub, email, empresas }`) e o fallback de `JWT_REFRESH_EXPIRES_DAYS`.

- [ ] **Step 3: Sem commit (continuar)**

---

### Tarefa 1.3: Adicionar testes de borda no `AuthService.refreshTokens`

**Files:**
- Modify: `src/auth/application/services/auth.service.spec.ts` (adicionar 2 `it()` no `describe('refreshTokens')`)

- [ ] **Step 1: Adicionar 2 testes**

No arquivo [src/auth/application/services/auth.service.spec.ts](../../../src/auth/application/services/auth.service.spec.ts), dentro do `describe('refreshTokens')`, **após o último `it()` existente (linha ~349)**, adicione:

```typescript
    it('deve gerar tokens sem perfis quando user.empresas é undefined', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);

      mockRefreshTokenRepository.findByTokenWithUser.mockResolvedValue({
        id: '1',
        token: 'old-token',
        userId: 1,
        expiresAt,
        revokedAt: null,
        user: {
          id: 1,
          email: 'test@test.com',
          // empresas propositalmente undefined
        },
      });
      mockRefreshTokenRepository.revoke.mockResolvedValue(undefined);
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      const result = await service.refreshTokens('old-token');

      expect(result.access_token).toBeDefined();
      const signCall = mockJwtService.sign.mock.calls[0][0];
      expect(signCall.empresas).toEqual([]);
    });

    it('deve gerar tokens com empresas vazias quando user.empresas é []', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);

      mockRefreshTokenRepository.findByTokenWithUser.mockResolvedValue({
        id: '1',
        token: 'old-token',
        userId: 1,
        expiresAt,
        revokedAt: null,
        user: {
          id: 1,
          email: 'test@test.com',
          empresas: [],
        },
      });
      mockRefreshTokenRepository.revoke.mockResolvedValue(undefined);
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      const result = await service.refreshTokens('old-token');

      expect(result.access_token).toBeDefined();
      const signCall = mockJwtService.sign.mock.calls[0][0];
      expect(signCall.empresas).toEqual([]);
    });
```

- [ ] **Step 2: Rodar testes do `refreshTokens`**

Run: `npm run test -- src/auth/application/services/auth.service.spec.ts -t "refreshTokens"`

Expected: todos os testes do `refreshTokens` passam (4 antigos + 2 novos).

- [ ] **Step 3: Sem commit (continuar)**

---

### Tarefa 1.4: Adicionar testes para `AuthController.refresh`, `forgotPassword`, `resetPassword`

**Files:**
- Modify: `src/auth/application/controllers/auth.controller.spec.ts` (adicionar 3 novos `describe`)

- [ ] **Step 1: Adicionar 3 describes**

Substitua o conteúdo de [src/auth/application/controllers/auth.controller.spec.ts](../../../src/auth/application/controllers/auth.controller.spec.ts) por:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';
import { PasswordRecoveryService } from '../services/password-recovery.service';
import { LoginUsuarioDto } from '../../dto/login-usuario.dto';
import { RefreshTokenDto } from '../../dto/refresh-token.dto';
import { ForgotPasswordDto } from '../../dto/forgot-password.dto';
import { ResetPasswordDto } from '../../dto/reset-password.dto';
import { FastifyRequest } from 'fastify';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let passwordRecoveryService: jest.Mocked<PasswordRecoveryService>;

  const mockAuthService = {
    login: jest.fn(),
    refreshTokens: jest.fn(),
  };

  const mockPasswordRecoveryService = {
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        {
          provide: PasswordRecoveryService,
          useValue: mockPasswordRecoveryService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    passwordRecoveryService = module.get(PasswordRecoveryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve ser definido', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('deve chamar authService.login e retornar o resultado', async () => {
      const loginDto: LoginUsuarioDto = {
        email: 'test@example.com',
        senha: 'password123',
      };
      const mockReq = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'mockAgent' },
      } as unknown as FastifyRequest;
      const expectedResult = { access_token: 'mockAccessToken' };

      mockAuthService.login.mockResolvedValue(expectedResult);

      const result = await controller.login(loginDto, mockReq);

      expect(result).toEqual(expectedResult);
      expect(authService.login).toHaveBeenCalledWith(
        loginDto,
        mockReq.ip,
        mockReq.headers['user-agent'],
      );
    });

    it('deve chamar authService.login com undefineds quando req não tem ip/user-agent', async () => {
      const loginDto: LoginUsuarioDto = {
        email: 'test@example.com',
        senha: 'password123',
      };
      const mockReq = {
        ip: undefined,
        headers: {},
      } as unknown as FastifyRequest;

      mockAuthService.login.mockResolvedValue({ access_token: 'x' });

      await controller.login(loginDto, mockReq);

      expect(authService.login).toHaveBeenCalledWith(
        loginDto,
        undefined,
        undefined,
      );
    });
  });

  describe('refresh', () => {
    it('deve chamar authService.refreshTokens com o refresh_token do DTO', async () => {
      const dto: RefreshTokenDto = { refresh_token: 'old-refresh' };
      const expected = { access_token: 'new', refresh_token: 'new-refresh' };
      mockAuthService.refreshTokens.mockResolvedValue(expected);

      const result = await controller.refresh(dto);

      expect(result).toEqual(expected);
      expect(authService.refreshTokens).toHaveBeenCalledWith('old-refresh');
    });
  });

  describe('forgotPassword', () => {
    it('deve chamar passwordRecoveryService.forgotPassword e retornar undefined', async () => {
      const dto: ForgotPasswordDto = { email: 'user@example.com' };
      mockPasswordRecoveryService.forgotPassword.mockResolvedValue(undefined);

      const result = await controller.forgotPassword(dto);

      expect(result).toBeUndefined();
      expect(passwordRecoveryService.forgotPassword).toHaveBeenCalledWith(dto);
    });
  });

  describe('resetPassword', () => {
    it('deve chamar passwordRecoveryService.resetPassword e retornar undefined', async () => {
      const dto: ResetPasswordDto = {
        token: 'a'.repeat(64),
        novaSenha: 'NovaSenha123!',
      };
      mockPasswordRecoveryService.resetPassword.mockResolvedValue(undefined);

      const result = await controller.resetPassword(dto);

      expect(result).toBeUndefined();
      expect(passwordRecoveryService.resetPassword).toHaveBeenCalledWith(dto);
    });
  });
});
```

- [ ] **Step 2: Rodar testes do `AuthController`**

Run: `npm run test -- src/auth/application/controllers/auth.controller.spec.ts`

Expected: 5 testes passam (2 do `login` + 1 do `refresh` + 1 do `forgotPassword` + 1 do `resetPassword`).

- [ ] **Step 3: Sem commit (continuar para os e2e)**

---

### Tarefa 1.5: Adicionar e2e do `POST /auth/refresh` happy path

**Files:**
- Modify: `test/auth.e2e-spec.ts` (adicionar novo `describe('POST /auth/refresh')`)

- [ ] **Step 1: Adicionar describe `POST /auth/refresh`**

Em [test/auth.e2e-spec.ts](../../../test/auth.e2e-spec.ts), **após o último `describe('POST /auth/login')` (linha ~174)**, adicione:

```typescript
  describe('POST /auth/refresh', () => {
    it('deve renovar os tokens com um refresh_token válido', async () => {
      // 1. Cria usuário
      await request(app.getHttpServer())
        .post('/usuarios')
        .send({ email: 'refresh@example.com', senha: 'Password123!' })
        .expect(201);

      // 2. Login
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'refresh@example.com', senha: 'Password123!' })
        .expect(201);

      const oldRefresh = loginResponse.body.refresh_token;
      expect(oldRefresh).toBeDefined();

      // 3. Refresh
      const refreshResponse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: oldRefresh })
        .expect(201);

      expect(refreshResponse.body).toHaveProperty('access_token');
      expect(refreshResponse.body).toHaveProperty('refresh_token');
      expect(refreshResponse.body.refresh_token).not.toBe(oldRefresh);

      // 4. Decodifica o novo access_token e verifica
      const decoded = jwtService.decode(
        refreshResponse.body.access_token,
      ) as any;
      expect(decoded.sub).toBeDefined();
      expect(decoded.email).toBe('refresh@example.com');
    });

    it('deve retornar 401 com refresh_token inválido', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: 'token-inexistente' })
        .expect(401);
    });

    it('deve retornar 403 e revogar toda a cadeia quando token revogado é reusado', async () => {
      // 1. Cria usuário
      await request(app.getHttpServer())
        .post('/usuarios')
        .send({ email: 'reuse@example.com', senha: 'Password123!' })
        .expect(201);

      // 2. Login
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'reuse@example.com', senha: 'Password123!' })
        .expect(201);
      const firstRefresh = loginResponse.body.refresh_token;

      // 3. Refresh uma vez (token fica revogado)
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: firstRefresh })
        .expect(201);

      // 4. Tentar reusar o token antigo
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: firstRefresh })
        .expect(403);

      // 5. Verifica que TODOS os refresh tokens do usuário foram revogados
      const tokensAtivos = await prisma.refreshToken.count({
        where: { revokedAt: null },
      });
      expect(tokensAtivos).toBe(0);
    });
  });
```

- [ ] **Step 2: Subir Postgres + Redis**

Run: `docker compose up -d postgres redis`

Expected: containers sobem. Se já estiverem rodando, o comando é idempotente.

- [ ] **Step 3: Migrar banco de teste**

Run: `export $(cat .env.test | grep -v '^#' | xargs) && npm run test:migrate`

Expected: migrations aplicadas. Sem erro.

- [ ] **Step 4: Rodar e2e do auth**

Run: `npm run test:e2e -- --testPathPattern=auth.e2e-spec.ts`

Expected: testes do `login` (7 antigos) + testes do `refresh` (3 novos) passam. **Se algum falhar**: investigar antes de seguir. A falha pode indicar problema de infra (Postgres/Redis) ou mudança no comportamento esperado — nesse caso, **parar** e reportar.

- [ ] **Step 5: Sem commit (ainda falta mais e2e)**

---

### Tarefa 1.6: Adicionar e2e de login com `empresas` e lockout

**Files:**
- Modify: `test/auth.e2e-spec.ts` (adicionar 2 `it()`)

- [ ] **Step 1: Adicionar testes**

Em [test/auth.e2e-spec.ts](../../../test/auth.e2e-spec.ts), **dentro do `describe('POST /auth/login')` existente (após o último `it()` da linha ~173)**, adicione:

```typescript
    it('deve incluir empresas no JWT quando o usuário tem vínculos', async () => {
      // Cria empresa
      const empresaResponse = await request(app.getHttpServer())
        .post('/empresas')
        .send({ nome: 'Empresa Teste', cnpj: '12345678000199' })
        .expect(201);

      const empresaId = empresaResponse.body.id;

      // Cria usuário
      await request(app.getHttpServer())
        .post('/usuarios')
        .send({ email: 'empresa-user@example.com', senha: 'Password123!' })
        .expect(201);

      // Vincula usuário à empresa
      await request(app.getHttpServer())
        .post(`/empresas/${empresaId}/usuarios`)
        .send({ email: 'empresa-user@example.com' })
        .expect(201);

      // Login
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'empresa-user@example.com', senha: 'Password123!' })
        .expect(201);

      const decoded = jwtService.decode(response.body.access_token) as any;
      expect(decoded.empresas).toBeDefined();
      expect(Array.isArray(decoded.empresas)).toBe(true);
      expect(decoded.empresas.length).toBeGreaterThanOrEqual(1);
      expect(decoded.empresas[0]).toHaveProperty('id', empresaId);
      expect(decoded.empresas[0]).toHaveProperty('perfis');
    });

    it('deve bloquear a conta após 5 tentativas erradas (429)', async () => {
      // Cria usuário
      await request(app.getHttpServer())
        .post('/usuarios')
        .send({ email: 'lockout@example.com', senha: 'Password123!' })
        .expect(201);

      // 5 tentativas erradas
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'lockout@example.com', senha: 'wrong' })
          .expect(401);
      }

      // 6ª tentativa — conta bloqueada
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'lockout@example.com', senha: 'wrong' })
        .expect(429);
    });
```

- [ ] **Step 2: Verificar contratos DTO antes de rodar**

Antes de rodar, confirme em [src/empresas/dto/create-empresa.dto.ts](../../../src/empresas/dto/create-empresa.dto.ts) que os campos `nome` e `cnpj` são válidos. Se houver diferença, ajuste o `send` para o payload correto. Da mesma forma para o `add-usuario-empresa.dto.ts`.

- [ ] **Step 3: Rodar e2e completo do auth**

Run: `npm run test:e2e -- --testPathPattern=auth.e2e-spec.ts`

Expected: todos os testes passam. **Se o teste de lockout falhar com 401 (em vez de 429)**: o `CacheLoginAttemptTracker` depende do Redis estar configurado no `.env.test`. Verifique se `REDIS_HOST=localhost` e `REDIS_PORT=6379` no `.env.test` e se o container Redis está rodando (`docker compose ps redis`). Se mesmo assim falhar, **documente e pule com `it.skip` + `it.todo` com link para a issue**.

- [ ] **Step 4: Cobertura do módulo auth**

Run: `npm run test:cov`

Inspecione `coverage/lcov-report/index.html` e confirme que os arquivos do `auth` subiram de cobertura. Anote a % de cada arquivo. **Se algum ainda está abaixo de 90%**: a próxima onda (Password Recovery) tende a fechar. Se já estiver tudo em 90%+, ótimo.

- [ ] **Step 5: Lint**

Run: `npm run lint -- src/auth test/auth.e2e-spec.ts`

Expected: sem warnings nem errors.

- [ ] **Step 6: Commitar a Onda 1**

```bash
git add src/auth/application/services/auth.service.spec.ts \
        src/auth/application/controllers/auth.controller.spec.ts \
        test/auth.e2e-spec.ts
git commit -m "test(auth): onda 1 — login + refresh gaps

- AuthService.login: bordas user.senha null, dto.senha vazio, ordem
  findByEmail antes de recordFailure, LoginHistory com undefined
- AuthService.generateTokens: testes diretos com empresas undefined/[]/mapping
  e fallback de JWT_REFRESH_EXPIRES_DAYS=7
- AuthService.refreshTokens: bordas user.empresas undefined e []
- AuthController: testes para refresh, forgotPassword, resetPassword
- e2e: refresh happy path, refresh inválido, reuso de token (cadeia revogada),
  login com empresas no JWT, account lockout 429

Cobertura alvo: >= 90% no módulo auth (validar em coverage/lcov-report/index.html)"
```

---

## Onda 2: Password Recovery

### Tarefa 2.1: Adicionar testes de borda no `PasswordRecoveryService.forgotPassword`

**Files:**
- Modify: `src/auth/application/services/password-recovery.service.spec.ts` (adicionar 4 `it()`)

- [ ] **Step 1: Adicionar testes**

Em [src/auth/application/services/password-recovery.service.spec.ts](../../../src/auth/application/services/password-recovery.service.spec.ts), dentro do `describe('forgotPassword')` (após o último `it()` na linha ~175), adicione:

```typescript
    it('deve usar fallback http://localhost:3000 quando FRONTEND_URL não está configurado', async () => {
      mockConfigService.get.mockImplementation(() => undefined);
      const user = { id: 1, email: 'u@e.com', ativo: true };
      mockUsuarioRepository.findByEmail.mockResolvedValue(user);
      mockResetTokenRepository.invalidateAllForUser.mockResolvedValue(undefined);
      mockResetTokenRepository.create.mockResolvedValue({});
      mockEmailService.send.mockResolvedValue();

      await service.forgotPassword({ email: 'u@e.com' });

      const sentMessage = mockEmailService.send.mock.calls[0][0];
      expect(sentMessage.body).toContain('http://localhost:3000/reset-password?token=');
    });

    it('deve enviar o token plain no corpo do e-mail (não o hash)', async () => {
      const user = { id: 1, email: 'u@e.com', ativo: true };
      mockUsuarioRepository.findByEmail.mockResolvedValue(user);
      mockResetTokenRepository.invalidateAllForUser.mockResolvedValue(undefined);
      mockResetTokenRepository.create.mockResolvedValue({});
      mockEmailService.send.mockResolvedValue();

      await service.forgotPassword({ email: 'u@e.com' });

      const sentMessage = mockEmailService.send.mock.calls[0][0];
      const tokenMatch = sentMessage.body.match(/token=([0-9a-f]{64})/);
      expect(tokenMatch).not.toBeNull();
      const plainTokenFromEmail = tokenMatch![1];
      const storedHash = mockResetTokenRepository.create.mock.calls[0][0].tokenHash;
      // O hash armazenado NÃO pode ser igual ao token plain
      expect(storedHash).not.toBe(plainTokenFromEmail);
    });

    it('deve invalidar tokens anteriores antes de criar novo em chamadas sucessivas', async () => {
      const user = { id: 1, email: 'u@e.com', ativo: true };
      mockUsuarioRepository.findByEmail.mockResolvedValue(user);
      mockResetTokenRepository.invalidateAllForUser.mockResolvedValue(undefined);
      mockResetTokenRepository.create.mockResolvedValue({});
      mockEmailService.send.mockResolvedValue();

      // 1ª chamada
      await service.forgotPassword({ email: 'u@e.com' });
      // 2ª chamada
      await service.forgotPassword({ email: 'u@e.com' });

      // Cada chamada deve invalidar antes de criar
      expect(mockResetTokenRepository.invalidateAllForUser).toHaveBeenCalledTimes(2);
      expect(mockResetTokenRepository.create).toHaveBeenCalledTimes(2);

      // Em cada chamada, invalidate acontece antes de create
      // (invocationCallOrder é global, então verificamos pares)
      const invOrder1 = mockResetTokenRepository.invalidateAllForUser.mock.invocationCallOrder[0];
      const createOrder1 = mockResetTokenRepository.create.mock.invocationCallOrder[0];
      expect(invOrder1).toBeLessThan(createOrder1);

      const invOrder2 = mockResetTokenRepository.invalidateAllForUser.mock.invocationCallOrder[1];
      const createOrder2 = mockResetTokenRepository.create.mock.invocationCallOrder[1];
      expect(invOrder2).toBeLessThan(createOrder2);
    });

    it('NÃO chama passwordHasher em forgotPassword', async () => {
      const user = { id: 1, email: 'u@e.com', ativo: true };
      mockUsuarioRepository.findByEmail.mockResolvedValue(user);
      mockResetTokenRepository.invalidateAllForUser.mockResolvedValue(undefined);
      mockResetTokenRepository.create.mockResolvedValue({});
      mockEmailService.send.mockResolvedValue();

      await service.forgotPassword({ email: 'u@e.com' });

      expect(mockPasswordHasher.hash).not.toHaveBeenCalled();
      expect(mockPasswordHasher.compare).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Rodar testes**

Run: `npm run test -- src/auth/application/services/password-recovery.service.spec.ts`

Expected: 4 novos testes passam + 6 antigos.

- [ ] **Step 3: Sem commit (continuar)**

---

### Tarefa 2.2: Adicionar testes de borda no `PasswordRecoveryService.resetPassword`

**Files:**
- Modify: `src/auth/application/services/password-recovery.service.spec.ts` (adicionar 2 `it()`)

- [ ] **Step 1: Adicionar testes**

Em [src/auth/application/services/password-recovery.service.spec.ts](../../../src/auth/application/services/password-recovery.service.spec.ts), dentro do `describe('resetPassword')` (após o último `it()` na linha ~245), adicione:

```typescript
    it('deve propagar erro quando passwordHasher.hash lança', async () => {
      const tokenRecord = {
        id: 'token-id',
        userId: 1,
        tokenHash: 'any-hash',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        usedAt: null,
        createdAt: new Date(),
      };
      mockResetTokenRepository.findValidByHash.mockResolvedValue(tokenRecord);
      mockPasswordHasher.hash.mockRejectedValue(new Error('bcrypt falhou'));

      await expect(
        service.resetPassword({
          token: 'a'.repeat(64),
          novaSenha: 'NovaSenha123!',
        }),
      ).rejects.toThrow('bcrypt falhou');
    });

    it('deve logar sucesso com userId após reset', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});
      const tokenRecord = {
        id: 'token-id',
        userId: 42,
        tokenHash: 'any-hash',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        usedAt: null,
        createdAt: new Date(),
      };
      mockResetTokenRepository.findValidByHash.mockResolvedValue(tokenRecord);
      mockPasswordHasher.hash.mockResolvedValue('new-hash');

      await service.resetPassword({
        token: 'a'.repeat(64),
        novaSenha: 'NovaSenha123!',
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 42, event: 'auth.reset_password.success' }),
        'Senha redefinida com sucesso',
      );
      logSpy.mockRestore();
    });
```

- [ ] **Step 2: Adicionar import do `Logger` no topo do arquivo**

No topo de [src/auth/application/services/password-recovery.service.spec.ts](../../../src/auth/application/services/password-recovery.service.spec.ts), adicione ao import existente:

```typescript
import { Logger } from '@nestjs/common';
```

Verifique se já está importado. Se sim, ignore este step.

- [ ] **Step 3: Rodar testes**

Run: `npm run test -- src/auth/application/services/password-recovery.service.spec.ts`

Expected: 2 novos testes passam.

- [ ] **Step 4: Sem commit (continuar para e2e)**

---

### Tarefa 2.3: Adicionar e2e de cenários avançados de password recovery

**Files:**
- Modify: `test/auth-password-recovery.e2e-spec.ts` (adicionar 4 novos `it()`)

- [ ] **Step 1: Adicionar 4 cenários**

Em [test/auth-password-recovery.e2e-spec.ts](../../../test/auth-password-recovery.e2e-spec.ts), **dentro do `describe('POST /auth/reset-password')` existente, após o último `it()` na linha ~199**, adicione:

```typescript
    it('deve retornar 401 com token já usado (usedAt != null)', async () => {
      const user = await prisma.usuario.create({
        data: {
          email: 'used-token@example.com',
          senha: 'oldHashedPassword',
          ativo: true,
        },
      });

      const rawToken = 'b'.repeat(64);
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          usedAt: new Date(), // já usado
        },
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, novaSenha: 'NovaSenha123!' })
        .expect(401);
    });
```

Em [test/auth-password-recovery.e2e-spec.ts](../../../test/auth-password-recovery.e2e-spec.ts), **dentro do `describe('POST /auth/forgot-password')` existente, após o último `it()` na linha ~104**, adicione:

```typescript
    it('deve retornar 200 silencioso para usuário inativo (sem criar token)', async () => {
      await prisma.usuario.create({
        data: {
          email: 'inativo@example.com',
          senha: 'hashedPassword',
          ativo: false, // inativo
        },
      });

      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'inativo@example.com' })
        .expect(200);

      const tokens = await prisma.passwordResetToken.findMany({
        where: { userId: { not: undefined } },
      });
      // Filtra pelos tokens do usuário criado
      const user = await prisma.usuario.findUnique({
        where: { email: 'inativo@example.com' },
      });
      const userTokens = await prisma.passwordResetToken.findMany({
        where: { userId: user!.id },
      });
      expect(userTokens.length).toBe(0);
      expect(response.body).toEqual({});
    });

    it('deve invalidar token anterior quando nova solicitação é feita (cascade)', async () => {
      const user = await prisma.usuario.create({
        data: {
          email: 'cascade@example.com',
          senha: 'hashedPassword',
          ativo: true,
        },
      });

      // 1ª solicitação
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'cascade@example.com' })
        .expect(200);

      const tokensApos1 = await prisma.passwordResetToken.findMany({
        where: { userId: user.id },
      });
      expect(tokensApos1.length).toBe(1);
      expect(tokensApos1[0].usedAt).toBeNull();

      // 2ª solicitação
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'cascade@example.com' })
        .expect(200);

      const tokensApos2 = await prisma.passwordResetToken.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(tokensApos2.length).toBe(2);
      // 1º token agora com usedAt setado
      expect(tokensApos2[0].usedAt).not.toBeNull();
      // 2º token ainda válido
      expect(tokensApos2[1].usedAt).toBeNull();
    });
```

- [ ] **Step 2: Adicionar teste de reset revoga refresh tokens**

Em [test/auth-password-recovery.e2e-spec.ts](../../../test/auth-password-recovery.e2e-spec.ts), ainda no `describe('POST /auth/reset-password')`, adicione:

```typescript
    it('deve revogar todos os RefreshToken ativos do usuário após reset', async () => {
      const user = await prisma.usuario.create({
        data: {
          email: 'revoke-rt@example.com',
          senha: 'oldHashedPassword',
          ativo: true,
        },
      });

      // Cria um refresh token ativo para o usuário
      await prisma.refreshToken.create({
        data: {
          token: 'rt-ativo-123',
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Cria PasswordResetToken válido
      const rawToken = 'c'.repeat(64);
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          usedAt: null,
        },
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, novaSenha: 'NovaSenha123!' })
        .expect(200);

      // Verifica que o refresh token foi revogado
      const rt = await prisma.refreshToken.findUnique({
        where: { token: 'rt-ativo-123' },
      });
      expect(rt).not.toBeNull();
      expect(rt!.revokedAt).not.toBeNull();
    });
```

- [ ] **Step 3: Adicionar teste de login com senha nova após reset**

Em [test/auth-password-recovery.e2e-spec.ts](../../../test/auth-password-recovery.e2e-spec.ts), adicione (em qualquer `describe` ou crie um novo):

```typescript
  describe('fluxo completo de reset', () => {
    it('deve permitir login com a nova senha e falhar com a antiga', async () => {
      // Cria usuário
      await request(app.getHttpServer())
        .post('/usuarios')
        .send({ email: 'cycle@example.com', senha: 'OldPass123!' })
        .expect(201);

      // Login com senha antiga — sucesso
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'cycle@example.com', senha: 'OldPass123!' })
        .expect(201);

      // Cria PasswordResetToken válido diretamente no DB
      const user = await prisma.usuario.findUnique({
        where: { email: 'cycle@example.com' },
      });
      const rawToken = 'd'.repeat(64);
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user!.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          usedAt: null,
        },
      });

      // Reset
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, novaSenha: 'NewPass123!' })
        .expect(200);

      // Login com senha antiga — falha
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'cycle@example.com', senha: 'OldPass123!' })
        .expect(401);

      // Login com senha nova — sucesso
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'cycle@example.com', senha: 'NewPass123!' })
        .expect(201);
    });
  });
```

- [ ] **Step 4: Rodar e2e completo de password recovery**

Run: `npm run test:e2e -- --testPathPattern=auth-password-recovery`

Expected: 5 testes antigos + 5 testes novos passam. **Se algum falhar**: investigar (DB migration? campos do DTO?). **Parar e reportar** se for regressão.

- [ ] **Step 5: Cobertura**

Run: `npm run test:cov`

Verifique `coverage/lcov-report/index.html`. Anote as %.

- [ ] **Step 6: Lint**

Run: `npm run lint -- src/auth test/auth-password-recovery.e2e-spec.ts`

Expected: sem warnings.

- [ ] **Step 7: Commitar a Onda 2**

```bash
git add src/auth/application/services/password-recovery.service.spec.ts \
        test/auth-password-recovery.e2e-spec.ts
git commit -m "test(auth): onda 2 — password recovery gaps

- PasswordRecoveryService.forgotPassword: fallback FRONTEND_URL,
  email com token plain, cascade em chamadas sucessivas, sem hash
- PasswordRecoveryService.resetPassword: propaga erro do hasher,
  log de sucesso com userId
- e2e: reset com token usado, forgot inativo silencioso, cascade
  forgot 2x, reset revoga refresh tokens, login com senha nova após reset

Cobertura alvo: >= 90% no auth (validar em coverage/lcov-report/index.html)"
```

---

## Onda 3: Guards + JWT Strategy

### Tarefa 3.1: Adicionar testes de borda no `PermissaoGuard`

**Files:**
- Modify: `src/auth/application/guards/permissao.guard.spec.ts` (adicionar 5 `it()`)

- [ ] **Step 1: Adicionar testes**

Em [src/auth/application/guards/permissao.guard.spec.ts](../../../src/auth/application/guards/permissao.guard.spec.ts), **após o último `it()` na linha ~188**, adicione:

```typescript
  it('deve lançar ForbiddenException se vinculoEmpresa.perfis for undefined', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('SOME_PERMISSION');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-a',
          // perfis undefined
        },
      ],
    };
    mockRequest.headers = { 'x-empresa-id': 'empresa-a' };

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui acesso a esta empresa ou não possui perfis vinculados.',
      ),
    );
  });

  it('deve lançar ForbiddenException se vinculoEmpresa.perfis for null', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('SOME_PERMISSION');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-a',
          perfis: null as any,
        },
      ],
    };
    mockRequest.headers = { 'x-empresa-id': 'empresa-a' };

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui acesso a esta empresa ou não possui perfis vinculados.',
      ),
    );
  });

  it('deve lançar ForbiddenException se requiredPermissoes é array vazio', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-a',
          perfis: [
            { codigo: 'USER', permissoes: [{ codigo: 'ANY' }] },
          ],
        },
      ],
    };
    mockRequest.headers = { 'x-empresa-id': 'empresa-a' };

    // Array vazio → some() sobre [] é false → ForbiddenException
    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui permissões suficientes para acessar este recurso nesta empresa.',
      ),
    );
  });

  it('deve lançar ForbiddenException se perfil.permissoes for undefined', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('REQUIRED_PERMISSION');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-a',
          perfis: [
            { codigo: 'USER' }, // permissoes undefined
          ],
        },
      ],
    };
    mockRequest.headers = { 'x-empresa-id': 'empresa-a' };

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui permissões suficientes para acessar este recurso nesta empresa.',
      ),
    );
  });

  it('deve validar o empresaContext da empresa correta quando há múltiplas', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('PERMISSION_B');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-a',
          perfis: [
            {
              codigo: 'EDITOR_A',
              permissoes: [{ codigo: 'PERMISSION_A' }],
            },
          ],
        },
        {
          id: 'empresa-b',
          perfis: [
            {
              codigo: 'EDITOR_B',
              permissoes: [{ codigo: 'PERMISSION_B' }],
            },
          ],
        },
      ],
    };
    mockRequest.headers = { 'x-empresa-id': 'empresa-b' };

    const result = guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
    expect(mockRequest.empresaContext).toBeDefined();
    expect(mockRequest.empresaContext!.id).toBe('empresa-b');
    expect(mockRequest.empresaContext!.perfis![0].codigo).toBe('EDITOR_B');
  });
```

- [ ] **Step 2: Rodar testes do PermissaoGuard**

Run: `npm run test -- src/auth/application/guards/permissao.guard.spec.ts`

Expected: 8 antigos + 5 novos = 13 testes passam.

- [ ] **Step 3: Sem commit (continuar)**

---

### Tarefa 3.2: Adicionar testes de borda no `JwtStrategy`

**Files:**
- Modify: `src/auth/infrastructure/strategies/jwt.strategy.spec.ts` (adicionar 4 `it()`)

- [ ] **Step 1: Adicionar testes**

Em [src/auth/infrastructure/strategies/jwt.strategy.spec.ts](../../../src/auth/infrastructure/strategies/jwt.strategy.spec.ts), **dentro do `describe('validação')`, após o último `it()` na linha ~155**, adicione:

```typescript
    it('deve mapear permissoes undefined dentro de perfis', async () => {
      const payload: JwtPayload = {
        email: 'test@example.com',
        sub: 1,
        empresas: [
          {
            id: 'empresa-1',
            perfis: [
              { codigo: 'ADMIN' }, // permissoes undefined
            ],
          },
        ],
      };

      const result = await jwtStrategy.validate(payload);

      expect(result.empresas![0].perfis![0].permissoes).toBeUndefined();
    });

    it('deve mapear perfis undefined dentro de empresas', async () => {
      const payload: JwtPayload = {
        email: 'test@example.com',
        sub: 1,
        empresas: [
          {
            id: 'empresa-1',
            // perfis undefined
          },
        ],
      };

      const result = await jwtStrategy.validate(payload);

      expect(result.empresas![0].perfis).toBeUndefined();
    });

    it('deve retornar userId undefined quando payload.sub é undefined', async () => {
      const payload: JwtPayload = {
        email: 'test@example.com',
        // sub undefined
      };

      const result = await jwtStrategy.validate(payload);

      expect(result.userId).toBeUndefined();
    });

    it('deve retornar userId a partir de payload.sub (não userId legado)', async () => {
      const payload: JwtPayload = {
        email: 'test@example.com',
        sub: 99,
        userId: 1, // legado — não deve ser usado
      };

      const result = await jwtStrategy.validate(payload);

      // O código usa payload.sub, ignorando userId legado
      expect(result.userId).toBe(99);
    });
```

- [ ] **Step 2: Rodar testes**

Run: `npm run test -- src/auth/infrastructure/strategies/jwt.strategy.spec.ts`

Expected: 3 antigos + 4 novos = 7 testes passam.

- [ ] **Step 3: Cobertura + Lint + Commit da Onda 3**

Run: `npm run test:cov && npm run lint -- src/auth`

Verifique `coverage/lcov-report/index.html`. Se algum arquivo do `auth` ainda está abaixo de 90%, anote e siga para a Onda 4 (que adicionará testes de DTO). Se já chegou, ótimo.

```bash
git add src/auth/application/guards/permissao.guard.spec.ts \
        src/auth/infrastructure/strategies/jwt.strategy.spec.ts
git commit -m "test(auth): onda 3 — guards + jwt gaps

- PermissaoGuard: vinculoEmpresa.perfis null/undefined, requiredPermissoes
  array vazio, perfil.permissoes undefined, validação com múltiplas empresas
- JwtStrategy: permissoes undefined, perfis undefined, payload.sub undefined,
  ignorar userId legado (usa sub)

Cobertura alvo: >= 90% no auth (validar em coverage/lcov-report/index.html)"
```

---

## Onda 4: DTOs

### Tarefa 4.1: Adicionar testes de borda no `LoginUsuarioDto`

**Files:**
- Modify: `src/auth/dto/login-usuario.dto.spec.ts` (adicionar 3 `it()`)

- [ ] **Step 1: Verificar o spec atual**

Leia [src/auth/dto/login-usuario.dto.spec.ts](../../../src/auth/dto/login-usuario.dto.spec.ts) para entender a estrutura atual. Os testes provavelmente usam `validate(dto)` ou `new LoginUsuarioDto()` + validador.

- [ ] **Step 2: Adicionar testes**

Em [src/auth/dto/login-usuario.dto.spec.ts](../../../src/auth/dto/login-usuario.dto.spec.ts), adicione 3 novos `it()` (ajuste a sintaxe para o que o spec já usa, provavelmente `validate()`):

```typescript
  it('deve falhar com senha de 7 caracteres (limite mínimo -1)', async () => {
    const errors = await validate(
      plainToInstance(LoginUsuarioDto, {
        email: 'user@example.com',
        senha: 'a'.repeat(7),
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('senha');
  });

  it('deve passar com senha de exatamente 8 caracteres (limite mínimo)', async () => {
    const errors = await validate(
      plainToInstance(LoginUsuarioDto, {
        email: 'user@example.com',
        senha: 'a'.repeat(8),
      }),
    );
    expect(errors.length).toBe(0);
  });

  it('deve aceitar email em uppercase (IsEmail é case-insensitive)', async () => {
    const errors = await validate(
      plainToInstance(LoginUsuarioDto, {
        email: 'USER@EXAMPLE.COM',
        senha: 'Password123!',
      }),
    );
    expect(errors.length).toBe(0);
  });
```

- [ ] **Step 3: Ajustar imports se necessário**

Se `validate` e `plainToInstance` não estiverem importados, adicione:

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
```

- [ ] **Step 4: Rodar testes do DTO**

Run: `npm run test -- src/auth/dto/login-usuario.dto.spec.ts`

Expected: testes antigos + 3 novos passam.

- [ ] **Step 5: Sem commit (continuar)**

---

### Tarefa 4.2: Adicionar testes de borda no `ResetPasswordDto`

**Files:**
- Modify: `src/auth/dto/reset-password.dto.spec.ts` (adicionar 5 `it()`)

- [ ] **Step 1: Verificar o spec atual**

Leia [src/auth/dto/reset-password.dto.spec.ts](../../../src/auth/dto/reset-password.dto.spec.ts).

- [ ] **Step 2: Adicionar testes**

Em [src/auth/dto/reset-password.dto.spec.ts](../../../src/auth/dto/reset-password.dto.spec.ts), adicione:

```typescript
  it('deve falhar com token com mais de 128 caracteres', async () => {
    const errors = await validate(
      plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(129),
        novaSenha: 'NovaSenha123!',
      }),
    );
    const tokenError = errors.find((e) => e.property === 'token');
    expect(tokenError).toBeDefined();
  });

  it('deve falhar quando novaSenha não tem letra maiúscula', async () => {
    const errors = await validate(
      plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(64),
        novaSenha: 'novasenha123!',
      }),
    );
    const senhaError = errors.find((e) => e.property === 'novaSenha');
    expect(senhaError).toBeDefined();
    expect(senhaError!.constraints).toHaveProperty('matches');
  });

  it('deve falhar quando novaSenha não tem letra minúscula', async () => {
    const errors = await validate(
      plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(64),
        novaSenha: 'NOVASENHA123!',
      }),
    );
    const senhaError = errors.find((e) => e.property === 'novaSenha');
    expect(senhaError).toBeDefined();
  });

  it('deve falhar quando novaSenha não tem número', async () => {
    const errors = await validate(
      plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(64),
        novaSenha: 'NovaSenhaSemNumero!',
      }),
    );
    const senhaError = errors.find((e) => e.property === 'novaSenha');
    expect(senhaError).toBeDefined();
  });

  it('deve passar com novaSenha contendo todos os requisitos', async () => {
    const errors = await validate(
      plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(64),
        novaSenha: 'NovaSenha123!',
      }),
    );
    expect(errors.length).toBe(0);
  });
```

- [ ] **Step 3: Ajustar imports se necessário**

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
```

- [ ] **Step 4: Rodar testes do DTO**

Run: `npm run test -- src/auth/dto/reset-password.dto.spec.ts`

Expected: testes antigos + 5 novos passam.

- [ ] **Step 5: Commitar a Onda 4**

```bash
git add src/auth/dto/login-usuario.dto.spec.ts \
        src/auth/dto/reset-password.dto.spec.ts
git commit -m "test(auth): onda 4 — dto edge cases

- LoginUsuarioDto: senha 7 chars (falha), 8 chars (passa), email uppercase
- ResetPasswordDto: token > 128 chars, sem maiúscula, sem minúscula,
  sem número, com todos os requisitos

Cobertura alvo: >= 90% no auth (validar em coverage/lcov-report/index.html)"
```

---

## Tarefa Final: Validação Completa

- [ ] **Step 1: Cobertura final**

Run: `npm run test:cov`

Abra `coverage/lcov-report/index.html`. Para cada arquivo em `src/auth/`, confirme que **todas as 4 métricas** (statements, branches, functions, lines) estão em **>= 90%**. Se algum arquivo ainda está abaixo:

- Identifique os branches/cenários não cobertos.
- Adicione testes pontuais seguindo o padrão das ondas anteriores.
- Repita até atingir 90% em todos.

- [ ] **Step 2: Validação rápida completa**

Run: `npm run validate:quick`

Expected: lint + typecheck + build + test passam sem warnings.

- [ ] **Step 3: E2E final**

Run: `npm run test:e2e -- --testPathPattern=auth`

Expected: todos os e2e de auth (login + refresh + password-recovery) passam.

- [ ] **Step 4: Commit final (se houver ajustes da Tarefa Final)**

```bash
git add .
git commit -m "test(auth): cobertura >= 90% no módulo auth (final)"
```

- [ ] **Step 5: Resumo**

Reporte ao usuário:
- Total de testes adicionados
- % final de cobertura (statements, branches, functions, lines) para `src/auth/`
- Lista de commits
- Se algum cenário teve que ser pulado (ex.: lockout por Redis indisponível)

---

## Troubleshooting

### Sintoma: "Nest can't resolve dependencies of the X"
**Causa:** mock de porta não está sendo registrado no `Test.createTestingModule`.
**Fix:** adicione o mock como provider, ex.: `{ provide: X, useValue: mockX }`.

### Sintoma: e2e falha com `connect ECONNREFUSED 127.0.0.1:5434` ou `6379`
**Causa:** Postgres/Redis não estão rodando.
**Fix:** `docker compose up -d postgres redis`. Verifique com `docker compose ps`.

### Sintoma: lockout test retorna 401 em vez de 429
**Causa:** `CacheLoginAttemptTracker` não está conseguindo salvar no Redis.
**Fix:** verifique `.env.test` para `REDIS_HOST=localhost` e `REDIS_PORT=6379`. Se o teste for flaky, use `it.skip` + `it.todo` documentando a issue.

### Sintoma: `Cannot find module 'src/...'`
**Causa:** Jest não está resolvendo o alias.
**Fix:** confirme que o `moduleNameMapper` em `package.json` contém `"^src/(.*)$": "<rootDir>/$1"`.

### Sintoma: `validate is not a function`
**Causa:** import do `class-validator` faltando.
**Fix:** adicione `import { validate } from 'class-validator';` no topo do spec.

### Sintoma: cobertura do `auth.guard.ts` ou `auth.guard.spec.ts` está baixa
**Causa:** o teste "deve relançar o erro se super.canActivate lançar um erro" tem uma asserção sobre `request.usuarioLogado`, mas se o `super.canActivate` lança antes de chegar no `if (result)`, o `request.usuarioLogado` fica undefined mesmo quando o erro é relançado corretamente. Considere adicionar mais cenários se necessário.

### Sintoma: e2e lento
**Causa:** testes e2e são seriais (`maxWorkers: 1`).
**Mitigação:** rode subconjuntos com `--testPathPattern` durante o desenvolvimento; rode todos no final.
