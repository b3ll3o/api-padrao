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
import { PrismaService } from '../../../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;

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
      if (key === 'JWT_EXPIRES_IN') return '60s';
      return null;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'mockSecret';
      return null;
    }),
  };

  const mockPrismaService = {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    loginHistory: {
      create: jest.fn(),
    },
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
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('deve retornar tokens de acesso e refresh se o login for bem-sucedido', async () => {
      const mockPermissao: Permissao = {
        id: 1,
        nome: 'read:users',
        codigo: 'READ_USERS',
        descricao: 'Read users',
        ativo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPerfil: Perfil = {
        id: 1,
        nome: 'Admin',
        codigo: 'ADMIN',
        descricao: 'Administrator',
        ativo: true,
        empresaId: 'empresa-1',
        permissoes: [mockPermissao],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockUsuarioEmpresa = new UsuarioEmpresa({
        id: 1,
        usuarioId: 1,
        empresaId: 'uuid-empresa',
        perfis: [mockPerfil],
      });
      const mockUser: Usuario = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ativo: true,
        empresas: [mockUsuarioEmpresa],
      };
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        mockUser,
      );
      mockPasswordHasher.compare.mockResolvedValue(true);
      mockPrismaService.refreshToken.create.mockResolvedValue({});

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
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
      expect(mockPrismaService.loginHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 1,
            ip: '127.0.0.1',
            userAgent: 'mockAgent',
          }),
        }),
      );
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
    });

    it('deve lançar UnauthorizedException se a senha for inválida', async () => {
      const mockUser: Usuario = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ativo: true,
        empresas: [],
      };
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
    });
  });

  describe('refreshTokens', () => {
    it('deve renovar tokens com sucesso', async () => {
      const mockUser = { id: 1, email: 'test@test.com', empresas: [] };
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);

      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: '1',
        token: 'old-token',
        userId: 1,
        expiresAt,
        revokedAt: null,
        user: mockUser,
      });
      mockPrismaService.refreshToken.update.mockResolvedValue({});
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const result = await service.refreshTokens('old-token');

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalled();
    });

    it('deve lançar ForbiddenException e revogar tudo se o token já foi usado (detecção de reuso)', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: '1',
        token: 'stolen-token',
        userId: 1,
        revokedAt: new Date(),
      });

      await expect(service.refreshTokens('stolen-token')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
