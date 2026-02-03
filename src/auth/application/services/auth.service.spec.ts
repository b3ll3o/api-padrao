import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';
import { Usuario } from '../../../usuarios/domain/entities/usuario.entity';
import { Perfil } from '../../../perfis/domain/entities/perfil.entity';
import { Permissao } from '../../../permissoes/domain/entities/permissao.entity';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { UsuarioEmpresa } from '../../../usuarios/domain/entities/usuario-empresa.entity';
import { ConfigService } from '@nestjs/config';

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
    it('deve retornar um token de acesso com usuário, empresas e perfis se o login for bem-sucedido', async () => {
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

      const loginDto = { email: 'test@example.com', senha: 'password123' };
      const result = await service.login(loginDto);

      expect(result).toEqual({ access_token: 'mockAccessToken' });
      expect(
        mockUsuarioRepository.findByEmailWithPerfisAndPermissoes,
      ).toHaveBeenCalledWith('test@example.com');

      expect(mockPasswordHasher.compare).toHaveBeenCalledWith(
        'password123',
        mockUser.senha,
      );
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        {
          email: mockUser.email,
          sub: mockUser.id,
          empresas: [
            {
              id: 'uuid-empresa',
              perfis: [
                {
                  id: mockPerfil.id,
                  nome: mockPerfil.nome,
                  codigo: mockPerfil.codigo,
                  descricao: mockPerfil.descricao,
                  permissoes: [
                    {
                      id: mockPermissao.id,
                      nome: mockPermissao.nome,
                      codigo: mockPermissao.codigo,
                      descricao: mockPermissao.descricao,
                    },
                  ],
                },
              ],
            },
          ],
        },
        { expiresIn: '60s' },
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
});
