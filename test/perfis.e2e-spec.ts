import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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

    // Criar um usuário de teste
    const createUserDto = {
      email: 'test-perfil@example.com',
      senha: 'Password123!',
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await request(app.getHttpServer())
      .post('/usuarios')
      .send(createUserDto)
      .expect(201);

    // Fazer login para obter um token
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
    it('deve criar um perfil', async () => {
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

    it('deve retornar 400 se o nome estiver faltando', () => {
      const createPerfilDto = {};
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .send(createPerfilDto)
        .expect(400);
    });

    it('deve retornar 409 se o perfil com o mesmo nome já existir', async () => {
      const createPerfilDto = { nome: 'duplicate:name' };
      // Criar o primeiro perfil
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .send(createPerfilDto)
        .expect(201);

      // Tentar criar um perfil duplicado
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .send(createPerfilDto)
        .expect(409)
        .expect((res) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.message).toEqual(
            `Perfil com o nome '${createPerfilDto.nome}' já existe.`,
          );
        });
    });

    it('deve retornar 404 se as permissões não existirem', async () => {
      const createPerfilDto = {
        nome: 'Perfil com Permissões Inválidas',
        permissoesIds: [99999],
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${token}`)
        .send(createPerfilDto)
        .expect(404)
        .expect((res) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.message).toEqual(
            'Permissão com ID 99999 não encontrada',
          );
        });
    });
  });

  describe('GET /perfis', () => {
    it('deve retornar um array de perfis', async () => {
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
    it('deve retornar um único perfil', async () => {
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

    it('deve retornar 404 se o perfil não for encontrado', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .get('/perfis/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PATCH /perfis/:id', () => {
    it('deve atualizar um perfil', async () => {
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

    it('deve retornar 404 se o perfil não for encontrado', () => {
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
    it('deve deletar um perfil', async () => {
      const perfil = await prisma.perfil.create({
        data: { nome: 'Deletable' },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .delete(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });

    it('deve retornar 404 se o perfil não for encontrado', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .delete('/perfis/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('GET /perfis/nome/:nome', () => {
    it('deve retornar um único perfil pelo nome', async () => {
      const perfil = await prisma.perfil.create({
        data: { nome: 'Admin' },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .get(`/perfis/nome/${perfil.nome}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', perfil.id);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.nome).toEqual(perfil.nome);
        });
    });

    it('deve retornar 404 se o perfil não for encontrado pelo nome', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return request(app.getHttpServer())
        .get('/perfis/nome/non-existent-perfil')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});