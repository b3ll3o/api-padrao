import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('PerfisController (e2e)', () => {
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
      email: 'test-perfil@example.com',
      senha: 'Password123!',
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await request(app.getHttpServer())
      .post('/usuarios')
      .send(createUserDto)
      .expect(201);

    // Login to get a token
    const loginDto = {
      email: 'test-perfil@example.com',
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
      where: { email: 'test-perfil@example.com' },
    });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.perfil.deleteMany();
  });

  afterEach(async () => {
    await prisma.perfil.deleteMany();
  });

  describe('POST /perfis', () => {
    it('should create a perfil', async () => {
      const createPerfilDto = { nome: 'Admin' };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .send(createPerfilDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.nome).toEqual(createPerfilDto.nome);
        });
    });

    it('should return 400 if nome is missing', () => {
      const createPerfilDto = {};
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .send(createPerfilDto)
        .expect(400);
    });
  });

  describe('GET /perfis', () => {
    it('should return an array of perfis', async () => {
      await prisma.perfil.create({ data: { nome: 'User' } });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .get('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toBeInstanceOf(Array);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.length).toBeGreaterThan(0);
        });
    });
  });

  describe('GET /perfis/:id', () => {
    it('should return a single perfil', async () => {
      const perfil = await prisma.perfil.create({ data: { nome: 'Editor' } });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .get(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', perfil.id);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.nome).toEqual(perfil.nome);
        });
    });

    it('should return 404 if perfil not found', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .get('/perfis/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PATCH /perfis/:id', () => {
    it('should update a perfil', async () => {
      const perfil = await prisma.perfil.create({ data: { nome: 'Viewer' } });
      const updatePerfilDto = { nome: 'Updated Viewer' };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatePerfilDto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', perfil.id);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.nome).toEqual(updatePerfilDto.nome);
        });
    });

    it('should return 404 if perfil not found', () => {
      const updatePerfilDto = { nome: 'Non Existent' };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .patch('/perfis/99999')
        .set('Authorization', `Bearer ${token}`)
        .send(updatePerfilDto)
        .expect(404);
    });
  });

  describe('DELETE /perfis/:id', () => {
    it('should delete a perfil', async () => {
      const perfil = await prisma.perfil.create({
        data: { nome: 'Deletable' },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .delete(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });

    it('should return 404 if perfil not found', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .delete('/perfis/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
