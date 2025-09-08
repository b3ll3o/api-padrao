import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertestRequest from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('UsuariosController (e2e)', () => {
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
    await prisma.usuario.deleteMany();
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

  describe('POST /usuarios', () => {
    it('deve criar um usuário e retornar 201', () => {
      const createUserDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201)
        .then((res) => {
          expect(res.body).toEqual({
            id: expect.any(Number),
            email: 'test@example.com',
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          });
        });
    });

    it('deve retornar 409 se o email já existir', async () => {
      const createUserDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      // Criar o primeiro usuário
      await prisma.usuario.create({ data: createUserDto });

      // Tentar criar o segundo usuário com o mesmo email
      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(409);
    });

    it('deve retornar 400 se o email for inválido', () => {
      const createUserDto = { email: 'invalid-email', senha: 'Password123!' };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400);
    });

    it('deve retornar 400 se a senha for muito curta', () => {
      const createUserDto = { email: 'test@example.com', senha: '123' };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400);
    });

    it('deve retornar 400 se a senha não atender aos requisitos de complexidade', () => {
      const createUserDto = {
        email: 'test@example.com',
        senha: 'password',
      };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400);
    });
  });
});
