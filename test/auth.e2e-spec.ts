import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.usuario.deleteMany();
    await prisma.perfil.deleteMany();
    await prisma.permissao.deleteMany();
  });

  describe('POST /auth/login', () => {
    it('deve permitir que um usuário faça login com sucesso e retorne JWT com perfis e permissões', async () => {
      // Criar permissões
      const perm1 = await prisma.permissao.create({
        data: {
          nome: 'read:users',
          codigo: 'READ_USERS',
          descricao: 'Permissão para ler usuários',
        },
      });
      const perm2 = await prisma.permissao.create({
        data: {
          nome: 'write:users',
          codigo: 'WRITE_USERS',
          descricao: 'Permissão para escrever usuários',
        },
      });

      // Criar um perfil com permissões
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'Admin',
          codigo: 'ADMIN',
          descricao: 'Perfil de administrador',
          permissoes: {
            connect: [{ id: perm1.id }, { id: perm2.id }],
          },
        },
      });

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

          // Verify each permission
          expect(decodedJwt.perfis[0].permissoes[0].nome).toEqual(perm1.nome);
          expect(decodedJwt.perfis[0].permissoes[0].codigo).toEqual(
            perm1.codigo,
          );
          expect(decodedJwt.perfis[0].permissoes[0].descricao).toEqual(
            perm1.descricao,
          );

          expect(decodedJwt.perfis[0].permissoes[1].nome).toEqual(perm2.nome);
          expect(decodedJwt.perfis[0].permissoes[1].codigo).toEqual(
            perm2.codigo,
          );
          expect(decodedJwt.perfis[0].permissoes[1].descricao).toEqual(
            perm2.descricao,
          );
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

    let accessToken: string;
    let userId: string;
    let redisClient: Redis;

    beforeAll(async () => {
      redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        db: 1, // Use a different DB for testing
      });

      // Create a test user and log in to get an access token
      const createUserDto = {
        email: 'ratelimit@example.com',
        senha: 'Password123!',
        perfisIds: [],
      };

      await request(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201);

      const loginDto = {
        email: 'ratelimit@example.com',
        senha: 'Password123!',
      };

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(201);

      accessToken = res.body.access_token;
      const decodedJwt: any = jwtService.decode(accessToken);
      userId = decodedJwt.sub;
    });

    beforeEach(async () => {
      // Clear Redis for the specific user before each rate limit test
      await redisClient.del(`rate-limit:${userId}`);
    });

    afterAll(async () => {
      await redisClient.quit();
    });

    it('deve permitir requisições dentro do limite', async () => {
      const limit = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10);

      for (let i = 0; i < limit; i++) {
        await request(app.getHttpServer())
          .get('/permissoes') // Use a protected route
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      }
    });

    it('deve bloquear requisições quando o limite é excedido', async () => {
      const limit = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10);

      // Make requests up to the limit
      for (let i = 0; i < limit; i++) {
        await request(app.getHttpServer())
          .get('/permissoes')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      }

      // The next request should be blocked
      await request(app.getHttpServer())
        .get('/permissoes')
        .set('Authorization', `Bearer ${accessToken}`)
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
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      }

      // Verify it's blocked
      await request(app.getHttpServer())
        .get('/permissoes')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(429);

      // Wait for the window to expire (durationSeconds + a small buffer)
      jest.advanceTimersByTime(durationSeconds * 1000 + 500);

      // Should be allowed again
      await request(app.getHttpServer())
        .get('/permissoes')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });
});
