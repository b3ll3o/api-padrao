import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';
import { LoginUsuarioDto } from '../../dto/login-usuario.dto';
import { FastifyRequest } from 'fastify';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    login: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
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
  });
});
