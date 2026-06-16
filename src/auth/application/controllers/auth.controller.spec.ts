import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';
import { PasswordRecoveryService } from '../services/password-recovery.service';
import { LoginUsuarioDto } from '../../dto/login-usuario.dto';
import { FastifyRequest } from 'fastify';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

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
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: PasswordRecoveryService,
          useValue: mockPasswordRecoveryService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve ser definido', () => {
    expect(controller).toBeInstanceOf(AuthController);
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

    it('deve passar ip e userAgent como undefined quando request não os fornece', async () => {
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
    it('deve chamar authService.refreshTokens com o refresh_token do dto', async () => {
      const refreshTokenDto = { refresh_token: 'old-refresh-token' };
      const expectedResult = { access_token: 'new', refresh_token: 'new-r' };

      mockAuthService.refreshTokens.mockResolvedValue(expectedResult);

      const result = await controller.refresh(refreshTokenDto);

      expect(result).toEqual(expectedResult);
      expect(authService.refreshTokens).toHaveBeenCalledWith(
        'old-refresh-token',
      );
    });

    it('deve propagar erro do authService.refreshTokens (token inválido)', async () => {
      const refreshTokenDto = { refresh_token: 'invalido' };
      mockAuthService.refreshTokens.mockRejectedValue(
        new Error('Token inválido'),
      );

      await expect(controller.refresh(refreshTokenDto)).rejects.toThrow(
        'Token inválido',
      );
    });
  });

  describe('forgotPassword', () => {
    it('deve chamar passwordRecoveryService.forgotPassword com o dto', async () => {
      const forgotPasswordDto = { email: 'user@example.com' };
      mockPasswordRecoveryService.forgotPassword.mockResolvedValue(undefined);

      await controller.forgotPassword(forgotPasswordDto);

      expect(mockPasswordRecoveryService.forgotPassword).toHaveBeenCalledWith(
        forgotPasswordDto,
      );
    });

    it('deve resolver com undefined (anti-enumeração: mesma resposta para e-mail existente ou não)', async () => {
      mockPasswordRecoveryService.forgotPassword.mockResolvedValue(undefined);

      const result = await controller.forgotPassword({
        email: 'inexistente@example.com',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    it('deve chamar passwordRecoveryService.resetPassword com o dto', async () => {
      const resetPasswordDto = {
        token: 'valid-token',
        novaSenha: 'NewPassword123!',
      };
      mockPasswordRecoveryService.resetPassword.mockResolvedValue(undefined);

      await controller.resetPassword(resetPasswordDto);

      expect(mockPasswordRecoveryService.resetPassword).toHaveBeenCalledWith(
        resetPasswordDto,
      );
    });

    it('deve propagar erro do passwordRecoveryService.resetPassword (token inválido/expirado)', async () => {
      const resetPasswordDto = { token: 'invalido', novaSenha: 'NewPass1!' };
      mockPasswordRecoveryService.resetPassword.mockRejectedValue(
        new Error('Token inválido ou expirado'),
      );

      await expect(controller.resetPassword(resetPasswordDto)).rejects.toThrow(
        'Token inválido ou expirado',
      );
    });
  });
});
