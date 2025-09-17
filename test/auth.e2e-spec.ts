import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { cleanDatabase, setupE2ETestData } from './e2e-utils';
import { TestDataBuilder } from './test-data-builder';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let testDataBuilder: TestDataBuilder;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);
    testDataBuilder = new TestDataBuilder(app);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();

    // Clean and setup common test data once for the entire suite
    await cleanDatabase(prisma);
    await setupE2ETestData(app);
  });

  afterAll(async () => {
    await app.close();
  });

  // For login tests, we need a clean state for users, profiles, and permissions
  // to ensure the specific test user can be created without conflicts.
  beforeEach(async () => {
    await prisma.usuario.deleteMany();
    await prisma.perfil.deleteMany();
    await prisma.permissao.deleteMany();
    // Re-setup base data for each test to ensure a consistent starting point
    await setupE2ETestData(app);
  });

  describe('POST /auth/login', () => {
    it('deve permitir que um usuário faça login com sucesso e retorne JWT com perfis e permissões', async () => {
      // Criar permissões usando o TestDataBuilder
      const perm1 = await testDataBuilder.createPermission(
        'read:users',
        'READ_USERS',
        'Permissão para ler usuários',
      );
      const perm2 = await testDataBuilder.createPermission(
        'write:users',
        'WRITE_USERS',
        'Permissão para escrever usuários',
      );

      // Criar um perfil com permissões usando o TestDataBuilder
      const perfil = await testDataBuilder.createProfile(
        'AdminTest',
        'ADMIN_TEST',
        'Perfil de administrador para teste',
        [perm1.codigo, perm2.codigo],
      );

      const createUserDto = {
        email: 'test@example.com',
        senha: 'Password123!',
        perfisIds: [perfil.id],
      };

      // Primeiro, criar um usuário com o perfil
      await request(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201);

      const loginDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(201)
        .then((res: { body: { access_token: string } }) => {
          expect(res.body).toHaveProperty('access_token');
          expect(typeof res.body.access_token).toBe('string');

          // Decodificar o JWT e verificar seu conteúdo
          const decodedJwt: any = jwtService.decode(res.body.access_token);

          expect(decodedJwt.email).toEqual(createUserDto.email);
          expect(decodedJwt.sub).toBeDefined();
          expect(decodedJwt.perfis).toBeInstanceOf(Array);
          expect(decodedJwt.perfis.length).toEqual(1);

          // Check profile properties
          expect(decodedJwt.perfis[0].nome).toEqual(perfil.nome);
          expect(decodedJwt.perfis[0].codigo).toEqual(perfil.codigo);
          expect(decodedJwt.perfis[0].descricao).toEqual(perfil.descricao);

          // Check permissions properties
          expect(decodedJwt.perfis[0].permissoes).toBeInstanceOf(Array);
          expect(decodedJwt.perfis[0].permissoes.length).toEqual(2);

          // Verify each permission (order might vary, so check for existence)
          const decodedPermCodes = decodedJwt.perfis[0].permissoes.map(
            (p) => p.codigo,
          );
          expect(decodedPermCodes).toContain(perm1.codigo);
          expect(decodedPermCodes).toContain(perm2.codigo);
        });
    });

    it('deve retornar 401 para credenciais inválidas', () => {
      const loginDto = {
        email: 'test@example.com',
        senha: 'wrongpassword',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(401);
    });

    it('deve retornar 401 para usuário inexistente', () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        senha: 'Password123!',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(401);
    });

    it('deve retornar 400 para email inválido', () => {
      const loginDto = {
        email: 'invalid-email',
        senha: 'Password123!',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('E-mail inválido');
        });
    });

    it('deve retornar 400 para senha muito curta', () => {
      const loginDto = {
        email: 'test@example.com',
        senha: 'short',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain(
            'A senha deve ter no mínimo 8 caracteres',
          );
        });
    });

    it('deve retornar 400 se o email estiver faltando', () => {
      const loginDto = {
        senha: 'Password123!',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('O e-mail não pode ser vazio');
        });
    });

    it('deve retornar 400 se a senha estiver faltando', () => {
      const loginDto = {
        email: 'test@example.com',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('A senha não pode ser vazia');
        });
    });
  });

  describe('Rate Limiting (e2e)', () => {
    jest.useFakeTimers();

    let redisClient: Redis;
    let rateLimitUserToken: string;
    let rateLimitUserId: string;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let adminToken: string;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let userToken: string;

    beforeAll(async () => {
      redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        db: 1, // Use a different DB for testing
      });

      // Create a test user for rate limiting and get an access token
      const rateLimitUser = await testDataBuilder.createUser(
        'ratelimit@example.com',
        'Password123!',
        [],
      );
      rateLimitUserToken = testDataBuilder.generateToken(rateLimitUser);
      rateLimitUserId = rateLimitUser.id.toString();

      // Get admin and user tokens from the main setup
      const tokens = await setupE2ETestData(app);
      adminToken = tokens.adminToken;
      userToken = tokens.userToken;
    });

    beforeEach(async () => {
      // Clear Redis for the specific user before each rate limit test
      await redisClient.del(`rate-limit:${rateLimitUserId}`);
    });

    afterAll(async () => {
      await redisClient.quit();
      jest.useRealTimers();
    });

    it('deve permitir requisições dentro do limite', async () => {
      const limit = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10);

      for (let i = 0; i < limit; i++) {
        await request(app.getHttpServer())
          .get('/permissoes') // Use a protected route
          .set('Authorization', `Bearer ${rateLimitUserToken}`)
          .expect(200);
      }
    });

    it('deve bloquear requisições quando o limite é excedido', async () => {
      const limit = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10);

      // Make requests up to the limit
      for (let i = 0; i < limit; i++) {
        await request(app.getHttpServer())
          .get('/permissoes')
          .set('Authorization', `Bearer ${rateLimitUserToken}`)
          .expect(200);
      }

      // The next request should be blocked
      await request(app.getHttpServer())
        .get('/permissoes')
        .set('Authorization', `Bearer ${rateLimitUserToken}`)
        .expect(429); // Too Many Requests
    });

    it('deve permitir requisições novamente após a janela de tempo expirar', async () => {
      const limit = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10);
      const durationSeconds = parseInt(
        process.env.RATE_LIMIT_WINDOW_SECONDS || '60',
        10,
      );

      // Make requests up to the limit
      for (let i = 0; i < limit; i++) {
        await request(app.getHttpServer())
          .get('/permissoes')
          .set('Authorization', `Bearer ${rateLimitUserToken}`)
          .expect(200);
      }

      // Verify it's blocked
      await request(app.getHttpServer())
        .get('/permissoes')
        .set('Authorization', `Bearer ${rateLimitUserToken}`)
        .expect(429);

      // Wait for the window to expire (durationSeconds + a small buffer)
      jest.advanceTimersByTime(durationSeconds * 1000 + 500);

      // Should be allowed again
      await request(app.getHttpServer())
        .get('/permissoes')
        .set('Authorization', `Bearer ${rateLimitUserToken}`)
        .expect(200);
    });
  });
});
