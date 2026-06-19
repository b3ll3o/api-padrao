// BDD: features/health.feature (cenários de liveness/readiness)
// ATDD: test/health.e2e-spec.ts (e2e dos endpoints de health)
// TDD: cobertura do HealthController via HTTP
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase } from './e2e-utils';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

describe('HealthController (e2e)', () => {
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
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  // ---- /health/live (sinal "processo ativo") ----
  // [HEALTH-001] Liveness não checa mais memória. Resposta esperada: 200
  // enquanto o processo estiver rodando e o event loop não travado.

  it('GET /health/live deve responder 200 sem autenticação (rota pública)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
  });

  it('GET /health/live não deve exigir Authorization header (rota @Public())', async () => {
    // Garantia explícita: nenhum header de auth foi enviado.
    const response = await request(app.getHttpServer()).get('/health/live');

    expect(response.status).not.toBe(401);
  });

  // ---- /health/ready (Prisma + disco) ----

  it('GET /health/ready deve retornar 200 sem autenticação (rota pública)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('info');
  });

  it('GET /health/ready deve incluir database e storage no info', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);

    const info = response.body.info as Record<string, unknown>;
    expect(info).toHaveProperty('database');
    expect(info).toHaveProperty('storage');
  });
});
