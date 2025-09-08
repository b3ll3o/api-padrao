import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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

    // Criar um usuário de teste
    const createUserDto = {
      email: 'test-permissao@example.com',
      senha: 'Password123!',
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await request(app.getHttpServer())
      .post('/usuarios')
      .send(createUserDto)
      .expect(201);

    // Fazer login para obter um token
    const loginDto = {
      email: 'test-permissao@example.com',
      senha: 'Password123!',
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send(loginDto)
      .expect(201);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    token = res.body.access_token;
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: 'test-permissao@example.com' },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.permissao.deleteMany();
  });

  afterEach(async () => {
    await prisma.permissao.deleteMany();
  });

  describe('POST /permissoes', () => {
    it('deve criar uma permissão', async () => {
      const createPermissaoDto = { nome: 'read:users' };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .post('/permissoes')
        .set('Authorization', `Bearer ${token}`)
        .send(createPermissaoDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.nome).toEqual(createPermissaoDto.nome);
        });
    });

    it('deve retornar 400 se o nome estiver faltando', () => {
      const createPermissaoDto = {};
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .post('/permissoes')
        .set('Authorization', `Bearer ${token}`)
        .send(createPermissaoDto)
        .expect(400);
    });
  });

  describe('GET /permissoes', () => {
    it('deve retornar um array de permissões', async () => {
      await prisma.permissao.create({ data: { nome: 'write:users' } });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .get('/permissoes')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toBeInstanceOf(Array);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.length).toBeGreaterThan(0);
        });
    });
  });

  describe('GET /permissoes/:id', () => {
    it('deve retornar uma única permissão', async () => {
      const permissao = await prisma.permissao.create({
        data: { nome: 'delete:users' },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .get(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', permissao.id);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.nome).toEqual(permissao.nome);
        });
    });

    it('deve retornar 404 se a permissão não for encontrada', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .get('/permissoes/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('GET /permissoes/nome/:nome', () => {
    it('deve retornar uma única permissão pelo nome', async () => {
      const permissao = await prisma.permissao.create({
        data: { nome: 'read:roles' },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .get(`/permissoes/nome/${permissao.nome}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', permissao.id);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.nome).toEqual(permissao.nome);
        });
    });

    it('deve retornar 404 se a permissão não for encontrada pelo nome', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .get('/permissoes/nome/non-existent-permission')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PATCH /permissoes/:id', () => {
    it('deve atualizar uma permissão', async () => {
      const permissao = await prisma.permissao.create({
        data: { nome: 'update:users' },
      });
      const updatePermissaoDto = { nome: 'update:users:all' };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatePermissaoDto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', permissao.id);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.nome).toEqual(updatePermissaoDto.nome);
        });
    });

    it('deve retornar 404 se a permissão não for encontrada', () => {
      const updatePermissaoDto = { nome: 'Non Existent' }; // Define updatePermissaoDto here
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .patch('/permissoes/99999')
        .set('Authorization', `Bearer ${token}`)
        .send(updatePermissaoDto)
        .expect(404);
    });
  });

  describe('DELETE /permissoes/:id', () => {
    it('deve deletar uma permissão', async () => {
      const permissao = await prisma.permissao.create({
        data: { nome: 'delete:users' },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .delete(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });

    it('deve retornar 404 se a permissão não for encontrada', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .delete('/permissoes/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});