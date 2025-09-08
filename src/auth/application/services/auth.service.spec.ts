import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';
import { Usuario } from '../../../usuarios/domain/entities/usuario.entity';
import { Perfil } from '../../../perfis/domain/entities/perfil.entity';
import { Permissao } from '../../../permissoes/domain/entities/permissao.entity';

describe('AuthService', () => {
  let service: AuthService;

  const mockUsuarioRepository = {
    findByEmailWithPerfisAndPermissoes: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'mockAccessToken'),
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should return an access token with user, profiles, and permissions if login is successful', async () => {
      const mockPermissao: Permissao = { id: 1, nome: 'read:users' };
      const mockPerfil: Perfil = {
        id: 1,
        nome: 'Admin',
        permissoes: [mockPermissao],
      };
      const mockUser: Usuario = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        comparePassword: jest.fn(() => Promise.resolve(true)),
        perfis: [mockPerfil],
      };
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        mockUser,
      );

      const loginDto = { email: 'test@example.com', senha: 'password123' };
      const result = await service.login(loginDto);

      expect(result).toEqual({ access_token: 'mockAccessToken' });
      expect(
        mockUsuarioRepository.findByEmailWithPerfisAndPermissoes,
      ).toHaveBeenCalledWith('test@example.com');

      expect(mockUser.comparePassword).toHaveBeenCalledWith('password123');
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        {
          email: mockUser.email,
          sub: mockUser.id,
          perfis: [
            {
              id: mockPerfil.id,
              nome: mockPerfil.nome,
              permissoes: [
                {
                  id: mockPermissao.id,
                  nome: mockPermissao.nome,
                },
              ],
            },
          ],
        },
        { expiresIn: '60s' },
      );
    });

    it('should throw UnauthorizedException if user does not exist', async () => {
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

    it('should throw UnauthorizedException if password is invalid', async () => {
      const mockUser: Usuario = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        comparePassword: jest.fn(() => Promise.resolve(false)),
        perfis: [],
      };
      mockUsuarioRepository.findByEmailWithPerfisAndPermissoes.mockResolvedValue(
        mockUser,
      );

      const loginDto = { email: 'test@example.com', senha: 'wrongPassword' };

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(
        mockUsuarioRepository.findByEmailWithPerfisAndPermissoes,
      ).toHaveBeenCalledWith('test@example.com');

      expect(mockUser.comparePassword).toHaveBeenCalledWith('wrongPassword');
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });
  });
});
