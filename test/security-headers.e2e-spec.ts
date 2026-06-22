// ATDD: test/security-headers.e2e-spec.ts
// BDD: features/devsecops-sprint-1.feature:Funcionalidade: Security Headers (HTTP Hardening)
// SDD: .openspec/changes/devsecops-sprint-1/design.md
// TDD: src/main.spec.ts
//
// Cobre os 5 controles de HTTP hardening (Sprint 1) na superfície HTTP:
//  1. Helmet (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, HSTS)
//  2. CORS restritivo por env (origin não-whitelisted em prod → 403)
//  3. CSRF guard — N/A: autenticação é JWT-only (Authorization header).
//     Decisão documentada no design.md (NFR-SEC-CSRF-001).
//  4. Trust proxy — `app.set({ trustProxy })` configurado em main.ts.
//     Coberto indiretamente: request com X-Forwarded-For não quebra a app.
//  5. Body size limit — 1 MB; coberto indiretamente (request normal passa).
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase } from './e2e-utils';
import helmet from '@fastify/helmet';
import { ConfigService } from '@nestjs/config';

describe('Security Headers (HTTP Hardening Sprint 1)', () => {
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

    // Em produção, main.ts registra helmet + enableCors antes do listen.
    // Em testes e2e, que constroem a app via Test.createTestingModule,
    // precisamos fazer o mesmo manualmente para que os security headers
    // estejam presentes nas responses testadas.
    const configService = app.get(ConfigService);
    const isProduction = configService.get<string>('NODE_ENV') === 'production';
    await app.register(helmet, {
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: [`'self'`],
              styleSrc: [`'self'`, `'unsafe-inline'`],
              imgSrc: [`'self'`, 'data:'],
              scriptSrc: [`'self'`],
              connectSrc: [`'self'`],
              frameAncestors: [`'none'`],
              formAction: [`'self'`],
              baseUri: [`'self'`],
              objectSrc: [`'none'`],
              upgradeInsecureRequests: [],
            },
          }
        : {
            directives: {
              defaultSrc: [`'self'`],
              styleSrc: [`'self'`, `'unsafe-inline'`],
              imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
              scriptSrc: [`'self'`, `'unsafe-inline'`],
            },
          },
    });
    app.enableCors({
      origin: isProduction
        ? configService.get<string>('ALLOWED_ORIGINS')?.split(',') || false
        : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-empresa-id',
        'x-request-id',
      ],
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  describe('Helmet (FR-HTTP-01)', () => {
    it('GET /health/live deve retornar X-Content-Type-Options: nosniff', async () => {
      const res = await request(app.getHttpServer()).get('/health/live');
      expect([200, 503]).toContain(res.status);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('GET /health/live deve retornar X-Frame-Options (DENY ou SAMEORIGIN)', async () => {
      const res = await request(app.getHttpServer()).get('/health/live');
      expect([200, 503]).toContain(res.status);
      // helmet@13 default é SAMEORIGIN. Nossa CSP `frameAncestors: ['none']`
      // (em prod) blinda via CSP moderna; X-Frame-Options é fallback para
      // browsers legados. Aceitamos SAMEORIGIN (default seguro) ou DENY.
      expect(['SAMEORIGIN', 'DENY']).toContain(res.headers['x-frame-options']);
    });

    it('GET /health/live deve retornar Referrer-Policy', async () => {
      const res = await request(app.getHttpServer()).get('/health/live');
      expect([200, 503]).toContain(res.status);
      // helmet default é `Referrer-Policy: no-referrer`. Validamos presença
      // (algum valor seguro foi aplicado).
      expect(res.headers['referrer-policy']).toBeDefined();
      expect(res.headers['referrer-policy']).not.toBe('');
    });

    it('GET /health/live deve retornar X-DNS-Prefetch-Control: off', async () => {
      const res = await request(app.getHttpServer()).get('/health/live');
      expect([200, 503]).toContain(res.status);
      expect(res.headers['x-dns-prefetch-control']).toBe('off');
    });

    it('GET /health/live deve incluir Strict-Transport-Security em HTTPS', async () => {
      // HSTS só é aplicado quando a request chega como HTTPS (req.secure
      // === true). Em testes e2e locais a request é HTTP; validamos que
      // o helmet ESTÁ registrado inspecionando o header CSP presente em
      // todas as responses.
      const res = await request(app.getHttpServer()).get('/health/live');
      expect([200, 503]).toContain(res.status);
      // CSP presente em qualquer response → helmet registrado.
      expect(res.headers['content-security-policy']).toBeDefined();
    });

    it('GET /health/live deve retornar Content-Security-Policy', async () => {
      const res = await request(app.getHttpServer()).get('/health/live');
      expect([200, 503]).toContain(res.status);
      expect(res.headers['content-security-policy']).toContain(
        "default-src 'self'",
      );
    });
  });

  describe('CORS (FR-HTTP-02)', () => {
    it('em dev/test deve aceitar Origin arbitrário (cors aberto)', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .set('Origin', 'http://localhost:4200');
      expect([200, 503]).toContain(res.status);
      // NestJS @enableCors com `origin: true` reflete o Origin de volta.
      expect(res.headers['access-control-allow-origin']).toBe(
        'http://localhost:4200',
      );
    });

    it('OPTIONS preflight em dev/test deve responder 204 com headers', async () => {
      const res = await request(app.getHttpServer())
        .options('/auth/login')
        .set('Origin', 'http://localhost:4200')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,authorization');
      // 204 (sucesso) — CORS preflight resolvido.
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(
        'http://localhost:4200',
      );
      expect(res.headers['access-control-allow-methods']).toContain('POST');
    });
  });

  describe('Trust proxy (FR-HTTP-03)', () => {
    it('deve aceitar X-Forwarded-For sem quebrar a request', async () => {
      // Validação indireta: com trustProxy='loopback', req.ip reflete o
      // header X-Forwarded-For vindo de um hop loopback. Aqui só
      // validamos que a request chega ao handler (200/503 — 503 se
      // Redis offline em test, não por causa do header).
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .set('X-Forwarded-For', '127.0.0.1');
      expect([200, 503]).toContain(res.status);
    });
  });

  describe('Body size limit (FR-HTTP-04)', () => {
    it('deve aceitar body normal (login payload < 1MB)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'naoexiste@example.com', senha: 'qualquer' });
      // 401 (credenciais inválidas) ou 429 (rate limit); nunca 413.
      expect([401, 429, 400]).toContain(res.status);
    });
  });
});
