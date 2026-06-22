import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';
import { Usuario } from '../../../usuarios/domain/entities/usuario.entity';
import { Perfil } from '../../../perfis/domain/entities/perfil.entity';
import { Permissao } from '../../../permissoes/domain/entities/permissao.entity';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { UsuarioEmpresa } from '../../../usuarios/domain/entities/usuario-empresa.entity';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import { LoginHistoryRepository } from '../../domain/repositories/login-history.repository';
import { LoginAttemptTracker } from '../../domain/services/login-attempt-tracker.service';

/** [SEC-001] Helper — mesmo cálculo que `auth.service.ts` faz internamente. */
const hashRefreshToken = (raw: string): string =>
  createHash('sha256').update(raw).digest('hex');

/**
 * Testes do AuthService.
 *
 * Após ALT-001, este spec mocka apenas as **portas** (interfaces),
 * não o `PrismaService`. O service não depende mais do ORM.
 */
describe('AuthService', () => {
  let service: AuthService;

  // Helpers de mock que usam as factories de domínio (MED-003)
  // para evitar acoplar o spec a campos/métodos privados.
  const makePermissao = (overrides: Partial<Permissao> = {}): Permissao => {
    const p = Permissao.criar({
      nome: 'read:users',
      codigo: 'READ_USERS',
      descricao: 'Read users',
    });
    Object.assign(p, overrides);
    return p;
  };

  const makePerfil = (overrides: Partial<Perfil> = {}): Perfil => {
    const p = Perfil.criar({
      nome: 'Admin',
      codigo: 'ADMIN',
      descricao: 'Administrator',
      empresaId: 'empresa-1',
    });
    Object.assign(p, overrides);
    return p;
  };

  const makeUsuario = (overrides: Partial<Usuario> = {}): Usuario => {
    const u = Usuario.criar({
      email: 'test@example.com',
      senhaHash: 'hashedPassword',
    });
    Object.assign(u, overrides);
    return u;
  };

  const mockUsuarioRepository = {
    findByEmailWithCredentials: jest.fn(),
    findByEmailWithPerfisAndPermissoes: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'mockAccessToken'),
  };

  const mockPasswordHasher = {
    compare: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_ACCESS_EXPIRES_IN') return '60s';
      if (key === 'JWT_REFRESH_EXPIRES_DAYS') return 2;
      return null;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_SECRET')
        return 'mockSecretWithAtLeast32CharsForValidation!';
      return null;
    }),
  };

  // [ALT-001] Mocks das portas substituem o mock de `PrismaService`.
  const mockRefreshTokenRepository = {
    create: jest.fn(),
    findByTokenWithUser: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
  };

  const mockLoginHistoryRepository = {
    record: jest.fn(),
  };

  // [ALT-003] Mock do LoginAttemptTracker.
  const mockLoginAttemptTracker = {
    isLocked: jest.fn().mockResolvedValue(false),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    clearFailures: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsuarioRepository,
          useValue: mockUsuarioRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: PasswordHasher,
          useValue: mockPasswordHasher,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RefreshTokenRepository,
          useValue: mockRefreshTokenRepository,
        },
        {
          provide: LoginHistoryRepository,
          useValue: mockLoginHistoryRepository,
        },
        {
          provide: LoginAttemptTracker,
          useValue: mockLoginAttemptTracker,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve ser definido', () => {
    expect(service).toBeInstanceOf(AuthService);
  });

  describe('login', () => {
    it('deve retornar tokens de acesso e refresh se o login for bem-sucedido', async () => {
      const mockPermissao = makePermissao({ id: 1 });
      const mockPerfil = makePerfil({
        id: 1,
        permissoes: [mockPermissao],
      });
      const mockUsuarioEmpresa = new UsuarioEmpresa({
        id: 1,
        usuarioId: 1,
        empresaId: 'uuid-empresa',
        perfis: [mockPerfil],
      });
      const mockUser = makeUsuario({
        id: 1,
        senha: 'hashedPassword',
        empresas: [mockUsuarioEmpresa],
      });
      // [ALT-006] Step 1: credentials lookup (inclui senha).
      mockUsuarioRepository.findByEmailWithCredentials.mockResolvedValue({
        id: 1,
        email: mockUser.email,
        senha: mockUser.senha as string,
        ativo: true,
        deletedAt: null,
      });
      // [ALT-006] Step 2: perfis lookup (NÃO inclui senha).
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        mockUser,
      );
      mockPasswordHasher.compare.mockResolvedValue(true);
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);
      mockLoginHistoryRepository.record.mockResolvedValue(undefined);

      const loginDto = { email: 'test@example.com', senha: 'password123' };
      const result = await service.login(loginDto, '127.0.0.1', 'mockAgent');

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.access_token).toBe('mockAccessToken');

      expect(
        mockUsuarioRepository.findByEmailWithCredentials,
      ).toHaveBeenCalledWith('test@example.com');
      expect(
        mockUsuarioRepository.findByEmailWithPerfisAndPermissoes,
      ).toHaveBeenCalledWith('test@example.com');

      expect(mockPasswordHasher.compare).toHaveBeenCalledWith(
        'password123',
        mockUser.senha,
      );
      expect(mockJwtService.sign).toHaveBeenCalled();
      expect(mockRefreshTokenRepository.create).toHaveBeenCalled();
      expect(mockLoginHistoryRepository.record).toHaveBeenCalledWith({
        userId: 1,
        ip: '127.0.0.1',
        userAgent: 'mockAgent',
      });
    });

    it('deve lançar UnauthorizedException se o usuário não existir', async () => {
      mockUsuarioRepository.findByEmailWithCredentials.mockResolvedValue(null);

      const loginDto = {
        email: 'nonexistent@example.com',
        senha: 'password123',
      };

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(
        mockUsuarioRepository.findByEmailWithCredentials,
      ).toHaveBeenCalledWith('nonexistent@example.com');
      expect(mockJwtService.sign).not.toHaveBeenCalled();
      // [ALT-004] LoginHistory NÃO é gravado em falha
      expect(mockLoginHistoryRepository.record).not.toHaveBeenCalled();
      // [ALT-004] RefreshToken NÃO é criado em falha
      expect(mockRefreshTokenRepository.create).not.toHaveBeenCalled();
      // [ALT-006] NÃO deve carregar perfis quando credenciais falham
      expect(
        mockUsuarioRepository.findByEmailWithPerfisAndPermissoes,
      ).not.toHaveBeenCalled();
    });

    it('deve lançar UnauthorizedException se a senha for inválida', async () => {
      mockUsuarioRepository.findByEmailWithCredentials.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        ativo: true,
        deletedAt: null,
      });
      mockPasswordHasher.compare.mockResolvedValue(false);

      const loginDto = { email: 'test@example.com', senha: 'wrongPassword' };

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(
        mockUsuarioRepository.findByEmailWithCredentials,
      ).toHaveBeenCalledWith('test@example.com');

      expect(mockPasswordHasher.compare).toHaveBeenCalledWith(
        'wrongPassword',
        'hashedPassword',
      );
      expect(mockJwtService.sign).not.toHaveBeenCalled();
      // [ALT-003] Falha registra tentativa no tracker
      expect(mockLoginAttemptTracker.recordFailure).toHaveBeenCalledWith(
        'test@example.com',
      );
      // [ALT-006] NÃO deve carregar perfis quando senha é inválida
      expect(
        mockUsuarioRepository.findByEmailWithPerfisAndPermissoes,
      ).not.toHaveBeenCalled();
    });

    // [ALT-003] Account lockout
    it('deve lançar TooManyRequestsException se a conta está bloqueada', async () => {
      mockLoginAttemptTracker.isLocked.mockResolvedValueOnce(true);

      const loginDto = { email: 'bloqueado@exemplo.com', senha: 'qualquer' };

      await expect(service.login(loginDto)).rejects.toThrow(
        'Conta temporariamente bloqueada',
      );
      // Não deve nem consultar o DB
      expect(
        mockUsuarioRepository.findByEmailWithCredentials,
      ).not.toHaveBeenCalled();
      expect(
        mockUsuarioRepository.findByEmailWithPerfisAndPermissoes,
      ).not.toHaveBeenCalled();
    });

    // BDD: features/autenticacao.feature:Cenário: Login com senha nula no usuário
    it('deve lançar UnauthorizedException se credentials.senha for null', async () => {
      mockUsuarioRepository.findByEmailWithCredentials.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        senha: null,
        ativo: true,
        deletedAt: null,
      });
      mockPasswordHasher.compare.mockResolvedValue(false);

      const loginDto = { email: 'test@example.com', senha: 'qualquer' };

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPasswordHasher.compare).not.toHaveBeenCalled();
    });

    // BDD: features/autenticacao.feature:Cenário: Login com senha undefined no usuário
    it('deve lançar UnauthorizedException se credentials.senha for undefined', async () => {
      mockUsuarioRepository.findByEmailWithCredentials.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        senha: null,
        ativo: true,
        deletedAt: null,
      });

      const loginDto = { email: 'test@example.com', senha: 'qualquer' };

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    // BDD: features/autenticacao.feature:Cenário: Login com DTO de senha vazio
    it('deve lançar UnauthorizedException se dto.senha for vazio', async () => {
      mockUsuarioRepository.findByEmailWithCredentials.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        ativo: true,
        deletedAt: null,
      });

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

    // BDD: features/autenticacao.feature:Cenário: Ordem de chamadas em falha de login
    it('deve chamar findByEmailWithCredentials antes de recordFailure em falha', async () => {
      mockUsuarioRepository.findByEmailWithCredentials.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        senha: null,
        ativo: true,
        deletedAt: null,
      });

      await expect(
        service.login({ email: 'test@example.com', senha: 'qualquer' }),
      ).rejects.toThrow(UnauthorizedException);

      const findOrder =
        mockUsuarioRepository.findByEmailWithCredentials.mock
          .invocationCallOrder[0];
      const recordOrder =
        mockLoginAttemptTracker.recordFailure.mock.invocationCallOrder[0];
      expect(findOrder).toBeLessThan(recordOrder);
    });

    // BDD: features/autenticacao.feature:Cenário: Login bem-sucedido sem ip/userAgent
    it('deve chamar LoginHistory.record com undefined quando ip e userAgent não são fornecidos', async () => {
      const mockUser = makeUsuario({ id: 1, senha: 'hashedPassword' });
      mockUsuarioRepository.findByEmailWithCredentials.mockResolvedValue({
        id: 1,
        email: mockUser.email,
        senha: mockUser.senha as string,
        ativo: true,
        deletedAt: null,
      });
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

    // [ALT-003] Login bem-sucedido reseta o tracker
    it('deve limpar o contador de falhas no tracker após login bem-sucedido', async () => {
      const mockUser = makeUsuario({ id: 1, senha: 'hashedPassword' });
      mockUsuarioRepository.findByEmailWithCredentials.mockResolvedValue({
        id: 1,
        email: mockUser.email,
        senha: mockUser.senha as string,
        ativo: true,
        deletedAt: null,
      });
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        mockUser,
      );
      mockPasswordHasher.compare.mockResolvedValue(true);

      await service.login({ email: 'test@example.com', senha: 'senha' });

      expect(mockLoginAttemptTracker.clearFailures).toHaveBeenCalledWith(
        'test@example.com',
      );
    });

    // [ALT-006] Edge case: race condition — usuário deletado entre step 1 e step 2
    it('deve lançar UnauthorizedException se usuário sumir entre step 1 (credentials) e step 2 (perfis)', async () => {
      mockUsuarioRepository.findByEmailWithCredentials.mockResolvedValue({
        id: 1,
        email: 'race@example.com',
        senha: 'hashedPassword',
        ativo: true,
        deletedAt: null,
      });
      // Step 2 retorna null (usuário foi deletado entre as queries)
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        null,
      );
      mockPasswordHasher.compare.mockResolvedValue(true);

      await expect(
        service.login({ email: 'race@example.com', senha: 'senha' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('refreshTokens', () => {
    it('deve renovar tokens com sucesso', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);

      // [SEC-001] O repositório recebe/retorna HASH, não o token bruto.
      const oldToken = 'old-token';
      const oldHash = hashRefreshToken(oldToken);
      mockRefreshTokenRepository.findByTokenWithUser.mockResolvedValue({
        id: '1',
        tokenHash: oldHash,
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

      const result = await service.refreshTokens(oldToken);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(
        mockRefreshTokenRepository.findByTokenWithUser,
      ).toHaveBeenCalledWith(oldHash);
      expect(mockRefreshTokenRepository.revoke).toHaveBeenCalledWith('1');
    });

    it('deve lançar ForbiddenException e revogar tudo se o token já foi usado (detecção de reuso)', async () => {
      const stolenToken = 'stolen-token';
      mockRefreshTokenRepository.findByTokenWithUser.mockResolvedValue({
        id: '1',
        tokenHash: hashRefreshToken(stolenToken),
        userId: 1,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: new Date(),
        user: {
          id: 1,
          email: 'test@test.com',
          empresas: [],
        },
      });
      mockRefreshTokenRepository.revokeAllForUser.mockResolvedValue(undefined);

      await expect(service.refreshTokens(stolenToken)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRefreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(
        1,
      );
    });

    it('deve lançar UnauthorizedException quando o token não existe', async () => {
      mockRefreshTokenRepository.findByTokenWithUser.mockResolvedValue(null);

      await expect(service.refreshTokens('inexistente')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRefreshTokenRepository.revoke).not.toHaveBeenCalled();
    });

    it('deve lançar UnauthorizedException quando o token está expirado', async () => {
      const expiredToken = 'expired-token';
      mockRefreshTokenRepository.findByTokenWithUser.mockResolvedValue({
        id: '1',
        tokenHash: hashRefreshToken(expiredToken),
        userId: 1,
        expiresAt: new Date(Date.now() - 1000), // expirado
        revokedAt: null,
        user: { id: 1, email: 'x@x.com', empresas: [] },
      });

      await expect(service.refreshTokens(expiredToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRefreshTokenRepository.revoke).not.toHaveBeenCalled();
    });

    it('deve gerar tokens sem perfis quando user.empresas é undefined', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);

      const oldToken = 'old-token';
      mockRefreshTokenRepository.findByTokenWithUser.mockResolvedValue({
        id: '1',
        tokenHash: hashRefreshToken(oldToken),
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

      const result = await service.refreshTokens(oldToken);

      expect(result.access_token).toEqual(expect.any(String));
      expect(result.access_token.length).toBeGreaterThan(0);
      const signCall = (mockJwtService.sign.mock.calls[0] as any[])[0];
      expect(signCall.empresas).toEqual([]);
    });

    it('deve gerar tokens com empresas vazias quando user.empresas é []', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);

      const oldToken = 'old-token';
      mockRefreshTokenRepository.findByTokenWithUser.mockResolvedValue({
        id: '1',
        tokenHash: hashRefreshToken(oldToken),
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

      const result = await service.refreshTokens(oldToken);

      expect(result.access_token).toEqual(expect.any(String));
      expect(result.access_token.length).toBeGreaterThan(0);
      const signCall = (mockJwtService.sign.mock.calls[0] as any[])[0];
      expect(signCall.empresas).toEqual([]);
    });
  });

  describe('generateTokens', () => {
    it('deve gerar tokens com empresas como array vazio quando undefined', async () => {
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      const result = await service.generateTokens(1, 'user@e.com', undefined);

      expect(result.access_token).toBe('mockAccessToken');
      expect(result.refresh_token).toEqual(expect.any(String));
      expect(result.refresh_token.length).toBeGreaterThan(0);

      // Verifica que o JWT foi assinado com payload { sub, email, empresas: [] }
      const signCall = (mockJwtService.sign.mock.calls[0] as any[])[0];
      expect(signCall).toEqual({
        sub: 1,
        email: 'user@e.com',
        empresas: [],
      });
    });

    it('deve gerar tokens com empresas como array vazio quando vazio', async () => {
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      await service.generateTokens(1, 'user@e.com', []);

      const signCall = (mockJwtService.sign.mock.calls[0] as any[])[0];
      expect(signCall.empresas).toEqual([]);
    });

    it('deve mapear empresas com perfis e permissoes para o shape do JWT', async () => {
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

      const signCall = (mockJwtService.sign.mock.calls[0] as any[])[0];
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

    it('deve usar fallback de 2 dias quando JWT_REFRESH_EXPIRES_DAYS nao esta configurado [L4]', async () => {
      // Reconfigura o mock para nao retornar JWT_REFRESH_EXPIRES_DAYS
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'JWT_ACCESS_EXPIRES_IN') return '60s';
        if (key === 'JWT_REFRESH_EXPIRES_DAYS') return undefined;
        return null as any;
      });
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      const before = Date.now();
      await service.generateTokens(1, 'user@e.com', []);
      const after = Date.now();

      const createCall = (
        mockRefreshTokenRepository.create.mock.calls[0] as any[]
      )[0];
      const expiresAt: Date = createCall.expiresAt;
      // [L4] 2 dias = 2 * 24 * 60 * 60 * 1000 ms (reduzido de 7d, DevSecOps 2026-06-21)
      const expectedMs = 2 * 24 * 60 * 60 * 1000;
      const lower = before + expectedMs - 1000;
      const upper = after + expectedMs + 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(lower);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(upper);
    });

    // [SEC-001] Persistimos o HASH, não o token bruto.
    it('deve persistir SHA-256 do refresh token (nao o token bruto)', async () => {
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      const result = await service.generateTokens(1, 'user@e.com', []);

      const createCall = (
        mockRefreshTokenRepository.create.mock.calls[0] as any[]
      )[0];
      // create recebe `tokenHash` (hex de 64 chars), nunca `token`.
      expect(createCall.tokenHash).toEqual(
        createHash('sha256').update(result.refresh_token).digest('hex'),
      );
      expect(createCall.tokenHash).not.toEqual(result.refresh_token);
      expect(createCall).not.toHaveProperty('token');
    });

    it('deve passar expiresIn undefined ao jwtService.sign quando JWT_ACCESS_EXPIRES_IN nao esta configurado', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'JWT_ACCESS_EXPIRES_IN') return undefined;
        if (key === 'JWT_REFRESH_EXPIRES_DAYS') return 2;
        return null as any;
      });
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      await service.generateTokens(1, 'user@e.com', []);

      const signOptions = (mockJwtService.sign.mock.calls[0] as any[])[1];
      expect(signOptions.expiresIn).toBeUndefined();
    });
  });
});
