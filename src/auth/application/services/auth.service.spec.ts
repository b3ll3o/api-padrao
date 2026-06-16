import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
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
      if (key === 'JWT_REFRESH_EXPIRES_DAYS') return 7;
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
        empresas: [mockUsuarioEmpresa],
      });
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
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        null,
      );

      const loginDto = {
        email: 'nonexistent@example.com',
        senha: 'password123',
      };

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(
        mockUsuarioRepository.findByEmailWithPerfisAndPermissoes,
      ).toHaveBeenCalledWith('nonexistent@example.com');
      expect(mockJwtService.sign).not.toHaveBeenCalled();
      // [ALT-004] LoginHistory NÃO é gravado em falha
      expect(mockLoginHistoryRepository.record).not.toHaveBeenCalled();
      // [ALT-004] RefreshToken NÃO é criado em falha
      expect(mockRefreshTokenRepository.create).not.toHaveBeenCalled();
    });

    it('deve lançar UnauthorizedException se a senha for inválida', async () => {
      const mockUser = makeUsuario({ id: 1, empresas: [] });
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        mockUser,
      );
      mockPasswordHasher.compare.mockResolvedValue(false);

      const loginDto = { email: 'test@example.com', senha: 'wrongPassword' };

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(
        mockUsuarioRepository.findByEmailWithPerfisAndPermissoes,
      ).toHaveBeenCalledWith('test@example.com');

      expect(mockPasswordHasher.compare).toHaveBeenCalledWith(
        'wrongPassword',
        mockUser.senha,
      );
      expect(mockJwtService.sign).not.toHaveBeenCalled();
      // [ALT-003] Falha registra tentativa no tracker
      expect(mockLoginAttemptTracker.recordFailure).toHaveBeenCalledWith(
        'test@example.com',
      );
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
        mockUsuarioRepository.findByEmailWithPerfisAndPermissoes,
      ).not.toHaveBeenCalled();
    });

    // BDD: features/autenticacao.feature:Cenário: Login com senha nula no usuário
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

    // BDD: features/autenticacao.feature:Cenário: Login com senha undefined no usuário
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

    // BDD: features/autenticacao.feature:Cenário: Login com DTO de senha vazio
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

    // BDD: features/autenticacao.feature:Cenário: Ordem de chamadas em falha de login
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

    // BDD: features/autenticacao.feature:Cenário: Login bem-sucedido sem ip/userAgent
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

    // [ALT-003] Login bem-sucedido reseta o tracker
    it('deve limpar o contador de falhas no tracker após login bem-sucedido', async () => {
      const mockUser = makeUsuario({ id: 1, empresas: [] });
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        mockUser,
      );
      mockPasswordHasher.compare.mockResolvedValue(true);

      await service.login({ email: 'test@example.com', senha: 'senha' });

      expect(mockLoginAttemptTracker.clearFailures).toHaveBeenCalledWith(
        'test@example.com',
      );
    });
  });

  describe('refreshTokens', () => {
    it('deve renovar tokens com sucesso', async () => {
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

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(mockRefreshTokenRepository.revoke).toHaveBeenCalledWith('1');
    });

    it('deve lançar ForbiddenException e revogar tudo se o token já foi usado (detecção de reuso)', async () => {
      mockRefreshTokenRepository.findByTokenWithUser.mockResolvedValue({
        id: '1',
        token: 'stolen-token',
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

      await expect(service.refreshTokens('stolen-token')).rejects.toThrow(
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
      mockRefreshTokenRepository.findByTokenWithUser.mockResolvedValue({
        id: '1',
        token: 'expired-token',
        userId: 1,
        expiresAt: new Date(Date.now() - 1000), // expirado
        revokedAt: null,
        user: { id: 1, email: 'x@x.com', empresas: [] },
      });

      await expect(service.refreshTokens('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRefreshTokenRepository.revoke).not.toHaveBeenCalled();
    });

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

      expect(result.access_token).toEqual(expect.any(String));
      expect(result.access_token.length).toBeGreaterThan(0);
      const signCall = (mockJwtService.sign.mock.calls[0] as any[])[0];
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

    it('deve usar fallback de 7 dias quando JWT_REFRESH_EXPIRES_DAYS nao esta configurado', async () => {
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
      // 7 dias = 7 * 24 * 60 * 60 * 1000 ms
      const expectedMs = 7 * 24 * 60 * 60 * 1000;
      const lower = before + expectedMs - 1000;
      const upper = after + expectedMs + 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(lower);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(upper);
    });

    it('deve passar expiresIn undefined ao jwtService.sign quando JWT_ACCESS_EXPIRES_IN nao esta configurado', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'JWT_ACCESS_EXPIRES_IN') return undefined;
        if (key === 'JWT_REFRESH_EXPIRES_DAYS') return 7;
        return null as any;
      });
      mockRefreshTokenRepository.create.mockResolvedValue(undefined);

      await service.generateTokens(1, 'user@e.com', []);

      const signOptions = (mockJwtService.sign.mock.calls[0] as any[])[1];
      expect(signOptions.expiresIn).toBeUndefined();
    });
  });
});
