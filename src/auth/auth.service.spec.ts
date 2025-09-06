import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './application/services/auth.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { UsuarioRepository } from '../usuarios/domain/repositories/usuario.repository';
import { Usuario } from 'src/usuarios/domain/entities/usuario.entity';

interface UserWithoutSenha {
  id: number;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

describe('AuthService', () => {
  let service: AuthService;

  const mockUsuarioRepository = {
    findByEmail: jest.fn(),
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

  describe('validateUser', () => {
    it('should return a user if credentials are valid', async () => {
      const mockUser: Partial<Usuario> = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        comparePassword: jest.fn().mockResolvedValue(true),
      };
      mockUsuarioRepository.findByEmail.mockResolvedValue(mockUser);

      const result: UserWithoutSenha | null = await service.validateUser(
        'test@example.com',
        'password123',
      );

      expect(result).toEqual({
        id: 1,
        email: 'test@example.com',
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(mockUser.comparePassword).toHaveBeenCalledWith('password123');
    });

    it('should return null if user does not exist', async () => {
      mockUsuarioRepository.findByEmail.mockResolvedValue(null);

      const result: UserWithoutSenha | null = await service.validateUser(
        'nonexistent@example.com',
        'password123',
      );

      expect(result).toBeNull();
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        'nonexistent@example.com',
      );
    });

    it('should return null if password is invalid', async () => {
      const mockUser: Partial<Usuario> = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        comparePassword: jest.fn().mockResolvedValue(false),
      };
      mockUsuarioRepository.findByEmail.mockResolvedValue(mockUser);

      const result: UserWithoutSenha | null = await service.validateUser(
        'test@example.com',
        'wrongPassword',
      );

      expect(result).toBeNull();
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(mockUser.comparePassword).toHaveBeenCalledWith('wrongPassword');
    });
  });

  describe('login', () => {
    it('should return an access token if login is successful', async () => {
      const mockUser: UserWithoutSenha = {
        id: 1,
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const validateUserSpy = jest.spyOn(service, 'validateUser');
      validateUserSpy.mockResolvedValue(
        mockUser as {
          id: number;
          email: string;
          createdAt: Date;
          updatedAt: Date;
        },
      );

      const loginDto = { email: 'test@example.com', senha: 'password123' };
      const result = await service.login(loginDto);

      expect(result).toEqual({ access_token: 'mockAccessToken' });
      expect(validateUserSpy).toHaveBeenCalledWith(
        'test@example.com',
        'password123',
      );
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        email: mockUser.email,
        sub: mockUser.id,
      });
    });

    it('should throw UnauthorizedException if login fails', async () => {
      const validateUserSpy = jest.spyOn(service, 'validateUser');
      validateUserSpy.mockResolvedValue(null);

      const loginDto = { email: 'test@example.com', senha: 'wrongPassword' };

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(validateUserSpy).toHaveBeenCalledWith(
        'test@example.com',
        'wrongPassword',
      );
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });
  });
});
