import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaginatedResponseDto } from '../src/shared/dto/paginated-response.dto';
import { Permissao } from '../src/permissoes/domain/entities/permissao.entity';
import { cleanDatabase } from './e2e-utils';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt'; // Import JwtService

describe('PermissoesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string; // Renamed to adminToken for clarity
  let userToken: string; // Token for a user with limited permissions

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    const jwtService = app.get<JwtService>(JwtService); // Get JwtService instance

    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();

    // Setup for admin user and token (moved from beforeEach to beforeAll for efficiency)
    await cleanDatabase(prisma);

    const permissionsData = [
      {
        nome: 'create:permissao',
        codigo: 'CREATE_PERMISSAO',
        descricao: 'Permissão para criar permissões',
      },
      {
        nome: 'read:permissoes',
        codigo: 'READ_PERMISSOES',
        descricao: 'Permissão para ler permissões',
      },
      {
        nome: 'read:permissao_by_id',
        codigo: 'READ_PERMISSAO_BY_ID',
        descricao: 'Permissão para ler permissão por ID',
      },
      {
        nome: 'read:permissao_by_nome',
        codigo: 'READ_PERMISSAO_BY_NOME',
        descricao: 'Permissão para ler permissão por nome',
      },
      {
        nome: 'update:permissao',
        codigo: 'UPDATE_PERMISSAO',
        descricao: 'Permissão para atualizar permissão',
      },
      {
        nome: 'delete:permissao',
        codigo: 'DELETE_PERMISSAO',
        descricao: 'Permissão para deletar permissão',
      },
    ];
    const permissions = await Promise.all(
      permissionsData.map((p) => prisma.permissao.create({ data: p })),
    );

    let adminProfile = await prisma.perfil.create({
      data: {
        nome: 'Admin',
        codigo: 'ADMIN',
        descricao: 'Perfil de administrador',
        permissoes: {
          connect: permissions.map((p) => ({ id: p.id })),
        },
      },
    });
    adminProfile = await prisma.perfil.findUniqueOrThrow({
      where: { id: adminProfile.id },
      include: { permissoes: true },
    });

    // Create an admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await prisma.usuario.create({
      data: {
        email: 'admin@example.com',
        senha: hashedPassword,
        perfis: {
          connect: { id: adminProfile.id },
        },
      },
      include: { perfis: { include: { permissoes: true } } },
    });

    const loginDto = {
      email: 'admin@example.com',
      senha: 'admin123',
    };

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send(loginDto)
      .expect(201);

    adminToken = res.body.access_token;

    // Setup for a regular user with limited permissions
    const limitedPerms = await prisma.permissao.create({
      data: {
        nome: 'read:limited_resource',
        codigo: 'READ_LIMITED_RESOURCE',
        descricao: 'Permissão para ler um recurso limitado',
      },
    });
    const limitedProfile = await prisma.perfil.create({
      data: {
        nome: 'LimitedUser',
        codigo: 'LIMITED_USER',
        descricao: 'Perfil de usuário com acesso limitado',
        permissoes: {
          connect: { id: limitedPerms.id },
        },
      },
    });
    const limitedUserHashedPassword = await bcrypt.hash('Limited123!', 10);
    const limitedUser = await prisma.usuario.create({
      data: {
        email: 'limited@example.com',
        senha: limitedUserHashedPassword,
        perfis: {
          connect: { id: limitedProfile.id },
        },
      },
      include: { perfis: { include: { permissoes: true } } },
    });
    userToken = jwtService.sign({
      sub: limitedUser.id,
      email: limitedUser.email,
      perfis: limitedUser.perfis,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up data created by individual tests if necessary, but not global data
    await prisma.permissao.deleteMany({
      where: {
        codigo: {
          notIn: [
            'CREATE_PERMISSAO',
            'READ_PERMISSOES',
            'READ_PERMISSAO_BY_ID',
            'READ_PERMISSAO_BY_NOME',
            'UPDATE_PERMISSAO',
            'DELETE_PERMISSAO',
            'READ_LIMITED_RESOURCE',
          ],
        },
      },
    });
  });

  describe('POST /permissoes', () => {
    it('deve criar uma permissão', async () => {
      const createPermissaoDto = {
        nome: `read:users-${Date.now()}`,
        codigo: `READ_USERS_${Date.now()}`,
        descricao: 'Permissão para ler usuários',
      };

      return request(app.getHttpServer())
        .post('/permissoes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPermissaoDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');

          expect(res.body.nome).toEqual(createPermissaoDto.nome);
        });
    });

    it('deve retornar 403 se o usuário não tiver permissão para criar permissão', () => {
      const createPermissaoDto = {
        nome: `NoPerms-${Date.now()}`,
        codigo: `NO_PERMS_${Date.now()}`,
        descricao: 'Permissão sem permissão',
      };
      return request(app.getHttpServer())
        .post('/permissoes')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createPermissaoDto)
        .expect(403);
    });

    it('deve retornar 400 se o nome estiver faltando', () => {
      const createPermissaoDto = {};

      return request(app.getHttpServer())
        .post('/permissoes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPermissaoDto)
        .expect(400);
    });

    it('deve retornar 409 se a permissão com o mesmo nome já existir', async () => {
      const createPermissaoDto = {
        nome: 'duplicate:name',
        codigo: 'DUPLICATE_NAME',
        descricao: 'Permissão duplicada',
      };
      // Criar a primeira permissão
      await request(app.getHttpServer())
        .post('/permissoes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPermissaoDto)
        .expect(201);

      // Tentar criar uma permissão duplicada
      return request(app.getHttpServer())
        .post('/permissoes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPermissaoDto)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toEqual(
            `Permissão com o nome '${createPermissaoDto.nome}' já existe.`,
          );
        });
    });
  });

  describe('GET /permissoes', () => {
    it('deve retornar uma lista paginada de permissões', async () => {
      return request(app.getHttpServer())
        .get('/permissoes')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const paginatedResponse = res.body as PaginatedResponseDto<Permissao>;
          expect(paginatedResponse).toHaveProperty('data');
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toBeGreaterThan(0);
          expect(paginatedResponse).toHaveProperty('total');
          expect(typeof paginatedResponse.total).toBe('number');
        });
    });

    it('deve retornar 403 se o usuário não tiver permissão para ler permissões', () => {
      return request(app.getHttpServer())
        .get('/permissoes')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('GET /permissoes/:id', () => {
    it('deve retornar uma única permissão', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'delete:users',
          codigo: 'DELETE_USERS',
          descricao: 'Permissão para deletar usuários',
        },
      });

      return request(app.getHttpServer())
        .get(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', permissao.id);

          expect(res.body.nome).toEqual(permissao.nome);
        });
    });

    it('deve retornar 403 se o usuário não tiver permissão para ler permissão por ID', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'delete:users',
          codigo: 'DELETE_USERS',
          descricao: 'Permissão para deletar usuários',
        },
      });
      return request(app.getHttpServer())
        .get(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('deve retornar 404 se a permissão não for encontrada', () => {
      return request(app.getHttpServer())
        .get('/permissoes/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('GET /permissoes/nome/:nome', () => {
    it('deve retornar permissões que contêm a string no nome', async () => {
      await prisma.permissao.createMany({
        data: [
          {
            nome: 'permissao_teste_1',
            codigo: 'PERMISSAO_TESTE_1',
            descricao: 'Permissão de teste 1',
          },
          {
            nome: 'outra_permissao',
            codigo: 'OUTRA_PERMISSAO',
            descricao: 'Outra permissão de teste',
          },
          {
            nome: 'permissao_teste_2',
            codigo: 'PERMISSAO_TESTE_2',
            descricao: 'Permissão de teste 2',
          },
        ],
      });
      const paginationDto = { page: 1, limit: 10 };

      return request(app.getHttpServer())
        .get('/permissoes/nome/permissao')
        .query(paginationDto) // Add query parameters
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const paginatedResponse = res.body as PaginatedResponseDto<Permissao>;
          expect(paginatedResponse).toHaveProperty('data');
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toBeGreaterThan(0);
          expect(paginatedResponse).toHaveProperty('total');
          expect(typeof paginatedResponse.total).toBe('number');
        });
    });

    it('deve retornar 403 se o usuário não tiver permissão para ler permissões por nome', () => {
      const paginationDto = { page: 1, limit: 10 };
      return request(app.getHttpServer())
        .get('/permissoes/nome/teste')
        .query(paginationDto)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('deve retornar um array vazio se nenhuma permissão for encontrada', () => {
      const paginationDto = { page: 1, limit: 10 };

      return request(app.getHttpServer())
        .get('/permissoes/nome/naoexiste')
        .query(paginationDto) // Add query parameters
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const paginatedResponse = res.body as PaginatedResponseDto<Permissao>;
          expect(paginatedResponse).toHaveProperty('data');
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toEqual(0);
          expect(paginatedResponse).toHaveProperty('total');
          expect(typeof paginatedResponse.total).toBe('number');
        });
    });
  });

  describe('PATCH /permissoes/:id', () => {
    it('deve atualizar uma permissão', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'update:test',
          codigo: 'UPDATE_TEST',
          descricao: 'Permissão de teste para atualização',
        },
      });
      const updatePermissaoDto = { nome: 'updated:test' };

      return request(app.getHttpServer())
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatePermissaoDto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', permissao.id);
          expect(res.body.nome).toEqual(updatePermissaoDto.nome);
        });
    });

    it('deve retornar 403 se o usuário não tiver permissão para atualizar permissão', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'update:test',
          codigo: 'UPDATE_TEST',
          descricao: 'Permissão de teste para atualização',
        },
      });
      const updatePermissaoDto = { nome: 'updated:test' };
      return request(app.getHttpServer())
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updatePermissaoDto)
        .expect(403);
    });

    it('deve retornar 404 se a permissão a ser atualizada não for encontrada', () => {
      const updatePermissaoDto = { nome: 'nonexistent:update' };
      return request(app.getHttpServer())
        .patch('/permissoes/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatePermissaoDto)
        .expect(404);
    });
  });

  describe('DELETE /permissoes/:id', () => {
    it('deve deletar uma permissão', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'delete:test',
          codigo: 'DELETE_TEST',
          descricao: 'Permissão de teste para exclusão',
        },
      });

      return request(app.getHttpServer())
        .delete(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('deve retornar 403 se o usuário não tiver permissão para deletar permissão', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'delete:test',
          codigo: 'DELETE_TEST',
          descricao: 'Permissão de teste para exclusão',
        },
      });
      return request(app.getHttpServer())
        .delete(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('deve retornar 404 se a permissão a ser deletada não for encontrada', () => {
      const updatePermissaoDto = { nome: 'nonexistent:update' }; // Define updatePermissaoDto here
      return request(app.getHttpServer())
        .delete('/permissoes/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatePermissaoDto)
        .expect(404);
    });
  });
});
