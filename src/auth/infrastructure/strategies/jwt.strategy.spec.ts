import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { UsuariosService } from '../../../usuarios/application/services/usuarios.service';
import { UsuarioRepository } from '../../../usuarios/domain/repositories/usuario.repository';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { UnauthorizedException } from '@nestjs/common';

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

  // [M3 — REQ-AUTH-VALIDITY] Cache e repositório agora são injetados.
  let cacheStore: Map<string, boolean>;
  let mockCache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let mockUsuarioRepository: { findOne: jest.Mock };

  const buildActiveUsuario = (
    overrides: Partial<{
      id: number;
      ativo: boolean;
      deletedAt: Date | null;
    }> = {},
  ) => ({
    id: 1,
    ativo: true,
    deletedAt: null,
    ...overrides,
  });

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    cacheStore = new Map<string, boolean>();
    mockCache = {
      get: jest.fn(async (key: string) => cacheStore.get(key)),
      set: jest.fn(async (key: string, value: boolean) => {
        cacheStore.set(key, value);
      }),
      del: jest.fn(async (key: string) => {
        cacheStore.delete(key);
      }),
    };
    mockUsuarioRepository = {
      findOne: jest.fn(),
    };

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
        {
          provide: CACHE_MANAGER,
          useValue: mockCache as unknown as Cache,
        },
        {
          provide: UsuarioRepository,
          useValue: mockUsuarioRepository,
        },
      ],
    }).compile();

    jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
    // usuariosService = module.get<UsuariosService>(UsuariosService); // Removed unused assignment
  });

  it('deve ser definido', () => {
    expect(jwtStrategy).toBeInstanceOf(JwtStrategy);
  });

  describe('validação', () => {
    const baseActivePayload: JwtPayload = {
      email: 'test@example.com',
      sub: 1,
      empresas: [
        {
          id: 'empresa-1',
          perfis: [
            {
              codigo: 'ADMIN',
              permissoes: [{ codigo: 'CREATE_USER' }, { codigo: 'READ_USER' }],
            },
          ],
        },
      ],
    };

    // Helper para popular cache e evitar chamada ao repository.
    const primeCacheAsValid = (userId: number, valid: boolean) => {
      cacheStore.set(`auth:user-validity:${userId}`, valid);
    };

    it('deve retornar um payload de usuário válido com empresas e perfis', async () => {
      primeCacheAsValid(1, true);
      const payload: JwtPayload = { ...baseActivePayload, sub: 1 };

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
      primeCacheAsValid(1, true);
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
      primeCacheAsValid(1, true);
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
      primeCacheAsValid(0, true);
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
      primeCacheAsValid(1, true);
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
      primeCacheAsValid(1, true);
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
      primeCacheAsValid(99, true);
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

  // [M3 — REQ-AUTH-VALIDITY] Cobertura específica do gate de atividade.
  describe('validade do usuário (ativo + deletedAt)', () => {
    it('deve aceitar quando o usuário está ativo e não foi deletado (cache miss → repository)', async () => {
      mockUsuarioRepository.findOne.mockResolvedValueOnce(
        buildActiveUsuario({ id: 7, ativo: true, deletedAt: null }),
      );

      const result = await jwtStrategy.validate({
        email: 'live@example.com',
        sub: 7,
        empresas: [],
      });

      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(7, true);
      expect(mockCache.get).toHaveBeenCalledWith('auth:user-validity:7');
      expect(mockCache.set).toHaveBeenCalledWith(
        'auth:user-validity:7',
        true,
        60_000,
      );
      expect(result).toEqual({
        userId: 7,
        email: 'live@example.com',
        empresas: [],
      });
    });

    it('deve lançar UnauthorizedException quando o usuário tem ativo=false', async () => {
      mockUsuarioRepository.findOne.mockResolvedValueOnce(
        buildActiveUsuario({ id: 8, ativo: false, deletedAt: null }),
      );

      await expect(
        jwtStrategy.validate({
          email: 'disabled@example.com',
          sub: 8,
          empresas: [],
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mockCache.set).toHaveBeenCalledWith(
        'auth:user-validity:8',
        false,
        60_000,
      );
    });

    it('deve lançar UnauthorizedException quando o usuário tem deletedAt setado', async () => {
      mockUsuarioRepository.findOne.mockResolvedValueOnce(
        buildActiveUsuario({
          id: 9,
          ativo: true,
          deletedAt: new Date('2026-06-01T00:00:00Z'),
        }),
      );

      await expect(
        jwtStrategy.validate({
          email: 'deleted@example.com',
          sub: 9,
          empresas: [],
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mockCache.set).toHaveBeenCalledWith(
        'auth:user-validity:9',
        false,
        60_000,
      );
    });

    it('deve lançar UnauthorizedException quando o repository não encontra o usuário', async () => {
      mockUsuarioRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        jwtStrategy.validate({
          email: 'ghost@example.com',
          sub: 10,
          empresas: [],
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      // Cacheado como inválido para evitar bater de novo.
      expect(mockCache.set).toHaveBeenCalledWith(
        'auth:user-validity:10',
        false,
        60_000,
      );
    });

    it('deve aceitar usando o cache e NÃO consultar o repository quando já é válido', async () => {
      cacheStore.set('auth:user-validity:11', true);

      const result = await jwtStrategy.validate({
        email: 'cached@example.com',
        sub: 11,
        empresas: [],
      });

      expect(mockUsuarioRepository.findOne).not.toHaveBeenCalled();
      expect(result.userId).toBe(11);
    });

    it('deve rejeitar usando o cache (false) e NÃO consultar o repository', async () => {
      cacheStore.set('auth:user-validity:12', false);

      await expect(
        jwtStrategy.validate({
          email: 'cached-bad@example.com',
          sub: 12,
          empresas: [],
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mockUsuarioRepository.findOne).not.toHaveBeenCalled();
    });

    it('deve preservar o comportamento legado quando sub está ausente (não consulta repository)', async () => {
      // Tokens legacy sem `sub` continuam funcionando — o gate de
      // validade só atua quando há um identificador numérico.
      const result = await jwtStrategy.validate({
        email: 'orphan@example.com',
        empresas: [],
      });

      expect(mockUsuarioRepository.findOne).not.toHaveBeenCalled();
      expect(mockCache.get).not.toHaveBeenCalled();
      expect(result.userId).toBeUndefined();
      expect(result.email).toBe('orphan@example.com');
    });

    it('deve degradar aberto (consulta no banco) quando o cache.get falha', async () => {
      mockCache.get.mockRejectedValueOnce(new Error('redis offline'));
      mockUsuarioRepository.findOne.mockResolvedValueOnce(
        buildActiveUsuario({ id: 13, ativo: true, deletedAt: null }),
      );

      const result = await jwtStrategy.validate({
        email: 'fallback@example.com',
        sub: 13,
        empresas: [],
      });

      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(13, true);
      expect(result.userId).toBe(13);
    });

    it('deve lançar UnauthorizedException quando o cache.get falha e usuário está inativo', async () => {
      mockCache.get.mockRejectedValueOnce(new Error('redis offline'));
      mockUsuarioRepository.findOne.mockResolvedValueOnce(
        buildActiveUsuario({ id: 14, ativo: false, deletedAt: null }),
      );

      await expect(
        jwtStrategy.validate({
          email: 'fallback-bad@example.com',
          sub: 14,
          empresas: [],
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('constructor', () => {
    it('deve configurar HS256 com JWT_SECRET do config', () => {
      // Recria a strategy para inspecionar as options passadas ao passport-jwt
      const strategy = new JwtStrategy(
        mockUsuariosService as any,
        mockConfigService as any,
        mockCache as any,
        mockUsuarioRepository as any,
      );
      // Como mockamos o Strategy, podemos inspecionar via options
      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
      expect(strategy).toBeInstanceOf(JwtStrategy);
    });

    it('deve propagar erro do ConfigService.getOrThrow quando JWT_SECRET ausente', () => {
      const brokenConfig = {
        get: jest.fn(),
        getOrThrow: jest.fn(() => {
          throw new Error('Config JWT_SECRET missing');
        }),
      };

      expect(() => {
        new JwtStrategy(
          mockUsuariosService as any,
          brokenConfig as any,
          mockCache as any,
          mockUsuarioRepository as any,
        );
      }).toThrow('Config JWT_SECRET missing');
    });
  });
});
