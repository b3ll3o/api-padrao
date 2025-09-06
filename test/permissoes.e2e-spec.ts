import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('PermissoesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();

    // Create a test user
    const createUserDto = {
      email: 'test-permissao@example.com',
      senha: 'Password123!',
    };
    await request(app.getHttpServer() as any)
      .post('/usuarios')
      .send(createUserDto)
      .expect(201);

    // Login to get a token
    const loginDto = {
      email: 'test-permissao@example.com',
      senha: 'Password123!',
    };
    const res = await request(app.getHttpServer() as any)
      .post('/auth/login')
      .send(loginDto)
      .expect(201);
    token = res.body.access_token;
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { email: 'test-permissao@example.com' } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.permissao.deleteMany();
  });

  afterEach(async () => {
    await prisma.permissao.deleteMany();
  });

  describe('POST /permissoes', () => {
    it('should create a permissao', async () => {
      const createPermissaoDto = { nome: 'read:users' };
      return request(app.getHttpServer() as any)
        .post('/permissoes')
        .set('Authorization', `Bearer ${token}`)
        .send(createPermissaoDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.nome).toEqual(createPermissaoDto.nome);
        });
    });

    it('should return 400 if nome is missing', () => {
      const createPermissaoDto = {};
      return request(app.getHttpServer() as any)
        .post('/permissoes')
        .set('Authorization', `Bearer ${token}`)
        .send(createPermissaoDto)
        .expect(400);
    });
  });

  describe('GET /permissoes', () => {
    it('should return an array of permissoes', async () => {
      await prisma.permissao.create({ data: { nome: 'write:users' } });
      return request(app.getHttpServer() as any)
        .get('/permissoes')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toBeInstanceOf(Array);
          expect(res.body.length).toBeGreaterThan(0);
        });
    });
  });

  describe('GET /permissoes/:id', () => {
    it('should return a single permissao', async () => {
      const permissao = await prisma.permissao.create({ data: { nome: 'delete:users' } });
      return request(app.getHttpServer() as any)
        .get(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', permissao.id);
          expect(res.body.nome).toEqual(permissao.nome);
        });
    });

    it('should return 404 if permissao not found', () => {
      return request(app.getHttpServer() as any)
        .get('/permissoes/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PATCH /permissoes/:id', () => {
    it('should update a permissao', async () => {
      const permissao = await prisma.permissao.create({ data: { nome: 'update:users' } });
      const updatePermissaoDto = { nome: 'update:users:all' };
      return request(app.getHttpServer() as any)
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatePermissaoDto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', permissao.id);
          expect(res.body.nome).toEqual(updatePermissaoDto.nome);
        });
    });

    it('should return 404 if permissao not found', () => {
      const updatePermissaoDto = { nome: 'Non Existent' };
      return request(app.getHttpServer() as any)
        .patch('/permissoes/99999')
        .set('Authorization', `Bearer ${token}`)
        .send(updatePermissaoDto)
        .expect(404);
    });
  });

  describe('DELETE /permissoes/:id', () => {
    it('should delete a permissao', async () => {
      const permissao = await prisma.permissao.create({ data: { nome: 'delete:users' } });
      return request(app.getHttpServer() as any)
        .delete(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });

    it('should return 404 if permissao not found', () => {
      return request(app.getHttpServer() as any)
        .delete('/permissoes/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
