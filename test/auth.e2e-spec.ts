import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

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

  afterEach(async () => {
    await prisma.usuario.deleteMany();
    await prisma.perfil.deleteMany();
    await prisma.permissao.deleteMany();
  });

  describe('POST /auth/login', () => {
    it('deve permitir que um usuário faça login com sucesso e retorne JWT com perfis e permissões', async () => {
      // Criar permissões
      const perm1 = await prisma.permissao.create({
        data: { nome: 'read:users' },
      });
      const perm2 = await prisma.permissao.create({
        data: { nome: 'write:users' },
      });

      // Criar um perfil com permissões
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'Admin',
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await request(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201);

      const loginDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(201)
        .then((res: { body: { access_token: string } }) => {
          expect(res.body).toHaveProperty('access_token');
          expect(typeof res.body.access_token).toBe('string');

          // Decodificar o JWT e verificar seu conteúdo
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const decodedJwt: any = jwtService.decode(res.body.access_token);

          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(decodedJwt.email).toEqual(createUserDto.email);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(decodedJwt.sub).toBeDefined();
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(decodedJwt.perfis).toBeInstanceOf(Array);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(decodedJwt.perfis.length).toEqual(1);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(decodedJwt.perfis[0].nome).toEqual(perfil.nome);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(decodedJwt.perfis[0].permissoes).toBeInstanceOf(Array);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(decodedJwt.perfis[0].permissoes.length).toEqual(2);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(decodedJwt.perfis[0].permissoes[0].nome).toEqual(perm1.nome);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(decodedJwt.perfis[0].permissoes[1].nome).toEqual(perm2.nome);
        });
    });

    it('deve retornar 401 para credenciais inválidas', () => {
      const loginDto = {
        email: 'test@example.com',
        senha: 'wrongpassword',
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(401);
    });
  });
});
