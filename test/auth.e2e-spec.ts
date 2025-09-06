import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.usuario.deleteMany();
  });

  afterEach(async () => {
    await prisma.usuario.deleteMany();
  });

  describe('POST /auth/login', () => {
    it('should allow a user to login successfully', async () => {
      const createUserDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      // First, create a user
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
        });
    });

    it('should return 401 for invalid credentials', () => {
      const loginDto = {
        email: 'test@example.com',
        senha: 'wrongpassword',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(401);
    });

    it('should return 401 for non-existent user', () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        senha: 'Password123!',
      };

      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(401);
    });
  });
});
