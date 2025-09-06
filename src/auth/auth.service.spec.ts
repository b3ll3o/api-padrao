import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './application/services/auth.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsuarioRepository } from '../usuarios/domain/repositories/usuario.repository';

jest.mock('bcrypt', () => ({
  compare: jest.fn((password, hash) => password === hash),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usuarioRepository: UsuarioRepository;
  let jwtService: JwtService;

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
    usuarioRepository = module.get<UsuarioRepository>(UsuarioRepository);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return a user if credentials are valid', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
      };
      mockUsuarioRepository.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser(
        'test@example.com',
        'password123',
      );

      expect(result).toEqual({ id: 1, email: 'test@example.com' });
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
    });

    it('should return null if user does not exist', async () => {
      mockUsuarioRepository.findByEmail.mockResolvedValue(null);

      const result = await service.validateUser(
        'nonexistent@example.com',
        'password123',
      );

      expect(result).toBeNull();
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        'nonexistent@example.com',
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should return null if password is invalid', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
      };
      mockUsuarioRepository.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser(
        'test@example.com',
        'wrongPassword',
      );

      expect(result).toBeNull();
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(bcrypt.compare).toHaveBeenCalledWith('wrongPassword', 'hashedPassword');
    });
  });

  describe('login', () => {
    it('should return an access token if login is successful', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
      };
      jest.spyOn(service, 'validateUser').mockResolvedValue(mockUser);

      const loginDto = { email: 'test@example.com', senha: 'password123' };
      const result = await service.login(loginDto);

      expect(result).toEqual({ access_token: 'mockAccessToken' });
      expect(service.validateUser).toHaveBeenCalledWith(
        'test@example.com',
        'password123',
      );
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        email: mockUser.email,
        sub: mockUser.id,
      });
    });

    it('should throw UnauthorizedException if login fails', async () => {
      jest.spyOn(service, 'validateUser').mockResolvedValue(null);

      const loginDto = { email: 'test@example.com', senha: 'wrongPassword' };

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(service.validateUser).toHaveBeenCalledWith(
        'test@example.com',
        'wrongPassword',
      );
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });
  });
});
