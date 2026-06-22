import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './app.config';

describe('AppConfig', () => {
  let appConfig: AppConfig;
  let configService: jest.Mocked<ConfigService>;

  const buildModule = async (env: Record<string, string | number> = {}) => {
    const getMock = jest.fn((key: string, defaultValue?: any) =>
      env[key] !== undefined ? env[key] : defaultValue,
    );
    const getOrThrowMock = jest.fn((key: string) => {
      if (env[key] === undefined) {
        throw new Error(`Config error: ${key} not found`);
      }
      return env[key];
    });
    configService = {
      get: getMock,
      getOrThrow: getOrThrowMock,
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppConfig,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    return module.get<AppConfig>(AppConfig);
  };

  beforeEach(async () => {
    appConfig = await buildModule();
  });

  describe('getters com valor default', () => {
    it('nodeEnv retorna "development" por padrão', () => {
      expect(appConfig.nodeEnv).toBe('development');
    });
    it('nodeEnv retorna valor do env quando definido', async () => {
      const cfg = await buildModule({ NODE_ENV: 'production' });
      expect(cfg.nodeEnv).toBe('production');
    });
    it('port retorna 3001 por padrão', () => {
      expect(appConfig.port).toBe(3001);
    });
    it('port retorna valor do env quando definido', async () => {
      const cfg = await buildModule({ PORT: 8080 });
      expect(cfg.port).toBe(8080);
    });
    it('redisHost retorna "localhost" por padrão', () => {
      expect(appConfig.redisHost).toBe('localhost');
    });
    it('redisPort retorna 6379 por padrão', () => {
      expect(appConfig.redisPort).toBe(6379);
    });
    it('cacheTtl retorna 600 por padrão', () => {
      expect(appConfig.cacheTtl).toBe(600);
    });
    it('throttlerShortTtl retorna 1000 por padrão', () => {
      expect(appConfig.throttlerShortTtl).toBe(1000);
    });
    it('throttlerShortLimit retorna 3 por padrão', () => {
      expect(appConfig.throttlerShortLimit).toBe(3);
    });
    it('throttlerMediumTtl retorna 10000 por padrão', () => {
      expect(appConfig.throttlerMediumTtl).toBe(10000);
    });
    it('throttlerMediumLimit retorna 20 por padrão', () => {
      expect(appConfig.throttlerMediumLimit).toBe(20);
    });
    it('throttlerLongTtl retorna 60000 por padrão', () => {
      expect(appConfig.throttlerLongTtl).toBe(60000);
    });
    it('throttlerLongLimit retorna 100 por padrão', () => {
      expect(appConfig.throttlerLongLimit).toBe(100);
    });
    it('throttlerSensitiveTtl retorna 60000 por padrão', () => {
      expect(appConfig.throttlerSensitiveTtl).toBe(60000);
    });
    it('throttlerSensitiveLimit retorna 10 por padrão', () => {
      expect(appConfig.throttlerSensitiveLimit).toBe(10);
    });
    it('jwtAccessExpiresIn retorna "15m" por padrão', () => {
      expect(appConfig.jwtAccessExpiresIn).toBe('15m');
    });
    it('jwtRefreshExpiresDays retorna 2 por padrão [L4 DevSecOps 2026-06-21]', () => {
      expect(appConfig.jwtRefreshExpiresDays).toBe(2);
    });
  });

  describe('getters sem default (getOrThrow)', () => {
    it('databaseUrl propaga erro quando DATABASE_URL não está definido', () => {
      expect(() => appConfig.databaseUrl).toThrow(/DATABASE_URL/);
    });
    it('jwtSecret propaga erro quando JWT_SECRET não está definido', () => {
      expect(() => appConfig.jwtSecret).toThrow(/JWT_SECRET/);
    });
    it('databaseUrl retorna valor do env', async () => {
      const cfg = await buildModule({ DATABASE_URL: 'postgres://x' });
      expect(cfg.databaseUrl).toBe('postgres://x');
    });
    it('jwtSecret retorna valor do env', async () => {
      const cfg = await buildModule({ JWT_SECRET: 's3cr3t' });
      expect(cfg.jwtSecret).toBe('s3cr3t');
    });
  });
});
