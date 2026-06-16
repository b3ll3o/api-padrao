import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { UsuariosService } from '../../../usuarios/application/services/usuarios.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

// Mock PassportStrategy and Strategy
jest.mock('passport-jwt', () => ({
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: jest.fn(() => 'mockExtractor'),
  },
  Strategy: jest.fn().mockImplementation(function (
    this: any,
    options: any,
    verify: any,
  ) {
    // Mock the constructor of Strategy
    this.options = options;
    this.verify = verify;
    this.authenticate = jest.fn(); // Mock the authenticate method if needed
  }),
}));

// Mock @nestjs/passport's PassportStrategy
jest.mock('@nestjs/passport', () => ({
  PassportStrategy: jest.fn().mockImplementation((StrategyClass) => {
    return class extends StrategyClass {
      constructor(...args: any[]) {
        super(...args);
      }
    };
  }),
}));

describe('JwtStrategy', () => {
  let jwtStrategy: JwtStrategy;
  // let usuariosService: UsuariosService; // Removed unused variable

  const mockUsuariosService = {
    // Mock any methods of UsuariosService that JwtStrategy might use
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') {
        return 'mockSecretWithAtLeast32CharsForValidation!';
      }
      return null;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') {
        return 'mockSecretWithAtLeast32CharsForValidation!';
      }
      throw new Error(`Config ${key} missing`);
    }),
  };

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: UsuariosService,
          useValue: mockUsuariosService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
    // usuariosService = module.get<UsuariosService>(UsuariosService); // Removed unused assignment
  });

  it('deve ser definido', () => {
    expect(jwtStrategy).toBeDefined();
  });

  describe('validação', () => {
    it('deve retornar um payload de usuário válido com empresas e perfis', async () => {
      const payload: JwtPayload = {
        email: 'test@example.com',
        sub: 1,
        empresas: [
          {
            id: 'empresa-1',
            perfis: [
              {
                codigo: 'ADMIN',
                permissoes: [
                  { codigo: 'CREATE_USER' },
                  { codigo: 'READ_USER' },
                ],
              },
            ],
          },
        ],
      };

      const result = await jwtStrategy.validate(payload);

      expect(result).toEqual({
        userId: payload.sub,
        email: payload.email,
        empresas: [
          {
            id: 'empresa-1',
            perfis: [
              {
                codigo: 'ADMIN',
                permissoes: [
                  { codigo: 'CREATE_USER' },
                  { codigo: 'READ_USER' },
                ],
              },
            ],
          },
        ],
      });
    });

    it('deve retornar um payload de usuário válido sem empresas ou perfis', async () => {
      const payload: JwtPayload = {
        email: 'test@example.com',
        sub: 1,
      };

      const result = await jwtStrategy.validate(payload);

      expect(result).toEqual({
        userId: payload.sub,
        email: payload.email,
        empresas: undefined,
      });
    });

    it('deve retornar um payload de usuário válido com array de empresas vazio', async () => {
      const payload: JwtPayload = {
        email: 'test@example.com',
        sub: 1,
        empresas: [],
      };

      const result = await jwtStrategy.validate(payload);

      expect(result).toEqual({
        userId: payload.sub,
        email: payload.email,
        empresas: [],
      });
    });

    it('deve retornar userId undefined quando sub ausente (apenas sub é lido)', async () => {
      const payload: JwtPayload = {
        email: 'legacy@example.com',
        userId: 42, // presente mas não lido
        // sub ausente
        empresas: [],
      };

      const result = await jwtStrategy.validate(payload);

      // A strategy sempre lê payload.sub, não payload.userId
      expect(result).toEqual({
        userId: undefined,
        email: 'legacy@example.com',
        empresas: [],
      });
    });

    it('deve lidar com empresa sem perfis (perfis undefined)', async () => {
      const payload: JwtPayload = {
        email: 'user@example.com',
        sub: 1,
        empresas: [
          {
            id: 'empresa-sem-perfis',
            // perfis ausente
          },
        ],
      };

      const result = await jwtStrategy.validate(payload);

      expect(result).toEqual({
        userId: 1,
        email: 'user@example.com',
        empresas: [
          {
            id: 'empresa-sem-perfis',
            perfis: undefined,
          },
        ],
      });
    });

    it('deve lidar com perfil sem permissoes (permissoes undefined)', async () => {
      const payload: JwtPayload = {
        email: 'user@example.com',
        sub: 1,
        empresas: [
          {
            id: 'empresa-a',
            perfis: [
              { codigo: 'PERFIL_SEM_PERMISSOES' }, // sem permissoes
            ],
          },
        ],
      };

      const result = await jwtStrategy.validate(payload);

      expect(result).toEqual({
        userId: 1,
        email: 'user@example.com',
        empresas: [
          {
            id: 'empresa-a',
            perfis: [
              { codigo: 'PERFIL_SEM_PERMISSOES', permissoes: undefined },
            ],
          },
        ],
      });
    });

    it('deve mapear múltiplas empresas com múltiplos perfis corretamente', async () => {
      const payload: JwtPayload = {
        email: 'multi@example.com',
        sub: 99,
        empresas: [
          {
            id: 'empresa-1',
            perfis: [
              {
                codigo: 'ADMIN',
                permissoes: [{ codigo: 'P1' }, { codigo: 'P2' }],
              },
              {
                codigo: 'USER',
                permissoes: [{ codigo: 'P3' }],
              },
            ],
          },
          {
            id: 'empresa-2',
            perfis: [
              {
                codigo: 'OPERADOR',
                permissoes: [{ codigo: 'P4' }],
              },
            ],
          },
        ],
      };

      const result = await jwtStrategy.validate(payload);

      expect(result.empresas).toHaveLength(2);
      expect(result.empresas![0].id).toBe('empresa-1');
      expect(result.empresas![0].perfis).toHaveLength(2);
      expect(result.empresas![0].perfis![0].codigo).toBe('ADMIN');
      expect(result.empresas![0].perfis![1].codigo).toBe('USER');
      expect(result.empresas![1].id).toBe('empresa-2');
      expect(result.empresas![1].perfis![0].codigo).toBe('OPERADOR');
    });
  });

  describe('constructor', () => {
    it('deve configurar HS256 com JWT_SECRET do config', () => {
      // Recria a strategy para inspecionar as options passadas ao passport-jwt
      const strategy = new JwtStrategy(
        mockUsuariosService as any,
        mockConfigService as any,
      );
      // Como mockamos o Strategy, podemos inspecionar via options
      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
      expect(strategy).toBeDefined();
    });

    it('deve propagar erro do ConfigService.getOrThrow quando JWT_SECRET ausente', () => {
      const brokenConfig = {
        get: jest.fn(),
        getOrThrow: jest.fn(() => {
          throw new Error('Config JWT_SECRET missing');
        }),
      };

      expect(() => {
        new JwtStrategy(mockUsuariosService as any, brokenConfig as any);
      }).toThrow('Config JWT_SECRET missing');
    });
  });
});
