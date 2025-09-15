import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { UsuariosService } from '../../../usuarios/application/services/usuarios.service';
import { Test, TestingModule } from '@nestjs/testing';
// import { Strategy } from 'passport-jwt'; // Removed unused import

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

// Mock jwtConstants using the exact relative path as in jwt.strategy.ts
jest.mock('../constants/jwt.constants', () => ({
  jwtConstants: {
    secret: 'mockSecret',
  },
}));

describe('JwtStrategy', () => {
  let jwtStrategy: JwtStrategy;
  // let usuariosService: UsuariosService; // Removed unused variable

  const mockUsuariosService = {
    // Mock any methods of UsuariosService that JwtStrategy might use
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
      ],
    }).compile();

    jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
    // usuariosService = module.get<UsuariosService>(UsuariosService); // Removed unused assignment
  });

  it('deve ser definido', () => {
    expect(jwtStrategy).toBeDefined();
  });

  describe('validação', () => {
    it('deve retornar um payload de usuário válido com perfis e permissões', async () => {
      const payload: JwtPayload = {
        email: 'test@example.com',
        sub: 1,
        perfis: [
          {
            codigo: 'ADMIN',
            permissoes: [{ codigo: 'CREATE_USER' }, { codigo: 'READ_USER' }],
          },
          {
            codigo: 'USER',
            permissoes: [{ codigo: 'READ_OWN_DATA' }],
          },
        ],
      };

      const result = await jwtStrategy.validate(payload);

      expect(result).toEqual({
        userId: payload.sub,
        email: payload.email,
        perfis: [
          {
            codigo: 'ADMIN',
            permissoes: [{ codigo: 'CREATE_USER' }, { codigo: 'READ_USER' }],
          },
          {
            codigo: 'USER',
            permissoes: [{ codigo: 'READ_OWN_DATA' }],
          },
        ],
      });
    });

    it('deve retornar um payload de usuário válido sem perfis ou permissões', async () => {
      const payload: JwtPayload = {
        email: 'test@example.com',
        sub: 1,
      };

      const result = await jwtStrategy.validate(payload);

      expect(result).toEqual({
        userId: payload.sub,
        email: payload.email,
        perfis: undefined, // Or an empty array, depending on expected behavior
      });
    });

    it('deve retornar um payload de usuário válido com array de perfis vazio', async () => {
      const payload: JwtPayload = {
        email: 'test@example.com',
        sub: 1,
        perfis: [],
      };

      const result = await jwtStrategy.validate(payload);

      expect(result).toEqual({
        userId: payload.sub,
        email: payload.email,
        perfis: [],
      });
    });
  });
});
