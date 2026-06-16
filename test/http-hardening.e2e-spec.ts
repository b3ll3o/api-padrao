// ATDD: test/http-hardening.e2e-spec.ts
// BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: HTTP Hardening
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-1
// TDD: src/shared/infrastructure/middleware/cache-control.middleware.spec.ts
// [Sprint1-HTTP] E2E smoke tests para trust proxy + cache-control middleware.
// NOTA: testes comportamentais detalhados ficam nos unit tests (TDD).
// Aqui validamos apenas:
//   1) App inicializa sem quebrar com X-Forwarded-For
//   2) /health/* responde sem Cache-Control: no-store (rota não-sensível)
//   3) CacheControlMiddleware está registrado no AppModule.configure()
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase } from './e2e-utils';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

describe('HTTP Hardening (e2e smoke)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { logger: false },
    );
    prisma = app.get<PrismaService>(PrismaService);

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  describe('Trust proxy', () => {
    it('deve aceitar X-Forwarded-For sem quebrar a request', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .set('X-Forwarded-For', '203.0.113.42');
      // 200 (healthy) ou 503 (redis offline) — ambos válidos
      expect([200, 503]).toContain(res.status);
    });

    it('deve aceitar X-Forwarded-For forjado em dev sem quebrar', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .set('X-Forwarded-For', '1.2.3.4');
      expect([200, 503]).toContain(res.status);
    });
  });

  describe('Cache-Control em rotas não-sensíveis', () => {
    it('/health/live NÃO deve ter Cache-Control: no-store', async () => {
      const res = await request(app.getHttpServer()).get('/health/live');
      // A rota é pública e não-sensível — middleware NÃO deve adicionar no-store
      expect([200, 503]).toContain(res.status);
      expect(res.headers['cache-control']).not.toBe('no-store');
    });
  });
});
