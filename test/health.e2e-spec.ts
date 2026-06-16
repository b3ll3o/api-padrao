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

  // ---- /health/live (apenas memória) ----
  // Observação: o threshold de 150MB pode ser excedido em ambiente de
  // teste (Jest + supertest + Prisma carregam memória). Aceitamos 200
  // (ok) OU 503 (threshold excedido, mas endpoint respondendo).
  // O que importa: o endpoint está público, roteado e responde.

  it('GET /health/live deve responder sem autenticação (rota pública)', async () => {
    const response = await request(app.getHttpServer()).get('/health/live');

    // 200 = healthy, 503 = memory threshold excedido, ambos válidos.
    // O que NÃO pode acontecer: 401 (rota é pública).
    expect([200, 503]).toContain(response.status);
    expect(response.status).not.toBe(401);
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
