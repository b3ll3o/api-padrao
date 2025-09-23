import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';
import { Usuario } from '../../../usuarios/domain/entities/usuario.entity';
import { Perfil } from '../../../perfis/domain/entities/perfil.entity';
import { Permissao } from '../../../permissoes/domain/entities/permissao.entity';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';

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
    it('deve retornar um token de acesso com usuário, perfis e permissões se o login for bem-sucedido', async () => {
      const mockPermissao: Permissao = {
        id: 1,
        nome: 'read:users',
        codigo: 'READ_USERS',
        descricao: 'Permite ler usuários',
        ativo: true,
      };
      const mockPerfil: Perfil = {
        id: 1,
        nome: 'Admin',
        codigo: 'ADMIN',
        descricao: 'Perfil de administrador',
        ativo: true,
        permissoes: [mockPermissao],
      };
      const mockUser: Usuario = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        perfis: [mockPerfil],
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
        perfis: [],
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
