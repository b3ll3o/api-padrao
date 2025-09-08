import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertestRequest from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('UsuariosController (e2e)', () => {
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

  describe('GET /usuarios/:id', () => {
    let user1;
    let user2;
    let user1Token;

    beforeEach(async () => {
      // Create two users
      user1 = await prisma.usuario.create({
        data: {
          email: 'user1@example.com',
          senha: 'Password123!',
        },
      });

      user2 = await prisma.usuario.create({
        data: {
          email: 'user2@example.com',
          senha: 'Password123!',
        },
      });

      // Create token for user1
      user1Token = jwtService.sign(
        {
          sub: user1.id,
          email: user1.email,
          perfis: [],
        },
        { expiresIn: '1h' },
      );
    });

    it('deve permitir que um usuário acesse seus próprios dados', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${user1.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual({
            id: user1.id,
            email: user1.email,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          });
        });
    });

    it('deve retornar 403 quando um usuário tenta acessar dados de outro usuário', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${user2.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(403)
        .then((res) => {
          expect(res.body.message).toBe(
            'Você não tem permissão para acessar os dados deste usuário',
          );
        });
    });

    it('deve retornar 401 quando não há token de autenticação', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${user1.id}`)
        .expect(401);
    });

    it('deve retornar 404 quando o usuário não existe', () => {
      return supertestRequest(app.getHttpServer())
        .get('/usuarios/99999')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404)
        .then((res) => {
          expect(res.body.message).toBe('Usuário com ID 99999 não encontrado');
        });
    });
  });
});
