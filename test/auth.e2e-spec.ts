import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { cleanDatabase } from './e2e-utils';

describe('AuthController (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { logger: false },
    );
    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const fastifyInstance = app.getHttpAdapter().getInstance();
    fastifyInstance.setErrorHandler((error, request, reply) => {
      console.error('--- FASTIFY ERROR ---');
      console.error('URL:', request.url);
      console.error('Error:', error);
      reply.send(error);
    });

    await app.init();
    await fastifyInstance.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  describe('POST /auth/login', () => {
    it('deve permitir que um usuário faça login com sucesso e retorne JWT com perfis e permissões', async () => {
      // 1. Criar um usuário, perfil e permissão
      const createUserDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      await request(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201);

      const loginDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      const decoded = jwtService.decode(response.body.access_token) as any;
      expect(decoded.email).toBe('test@example.com');
      expect(decoded).toHaveProperty('empresas');
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
        senha: 'anypassword',
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
});
