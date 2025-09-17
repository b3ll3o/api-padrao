import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaginatedResponseDto } from '../src/shared/dto/paginated-response.dto';
import { Permissao } from '../src/permissoes/domain/entities/permissao.entity';
import { cleanDatabase, setupE2ETestData } from './e2e-utils';
import { TestDataBuilder } from './test-data-builder';

describe('PermissoesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;
  let testDataBuilder: TestDataBuilder;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    testDataBuilder = new TestDataBuilder(app);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();

    // Clean and setup common test data once for the entire suite
    await cleanDatabase(prisma);
    const tokens = await setupE2ETestData(app);
    adminToken = tokens.adminToken;
    userToken = tokens.userToken;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up data created by individual tests if necessary, but not global data
    // The setupE2ETestData in beforeAll ensures base data is present.
    // For tests that modify base data, they should clean up after themselves
    // or create their own isolated data.
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
      const createPermissaoDto = {
        codigo: `MISSING_NAME_${Date.now()}`,
        descricao: 'Descrição',
      };

      return request(app.getHttpServer())
        .post('/permissoes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPermissaoDto)
        .expect(400);
    });

    it('deve retornar 409 se a permissão com o mesmo nome já existir', async () => {
      const uniqueName = `duplicate:name-${Date.now()}`;
      const createPermissaoDto = {
        nome: uniqueName,
        codigo: `DUPLICATE_NAME_${Date.now()}`,
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
            `Permissão com o nome '${uniqueName}' já existe.`,
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
      const permissao = await testDataBuilder.createPermission(
        'delete:users',
        'DELETE_USERS',
        'Permissão para deletar usuários',
      );

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
      const permissao = await testDataBuilder.createPermission(
        'delete:users-no-perms',
        'DELETE_USERS_NO_PERMS',
        'Permissão para deletar usuários sem permissão',
      );
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
      await testDataBuilder.createPermission(
        'permissao_teste_1',
        'PERMISSAO_TESTE_1',
        'Permissão de teste 1',
      );
      await testDataBuilder.createPermission(
        'outra_permissao',
        'OUTRA_PERMISSAO',
        'Outra permissão de teste',
      );
      await testDataBuilder.createPermission(
        'permissao_teste_2',
        'PERMISSAO_TESTE_2',
        'Permissão de teste 2',
      );
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
      const permissao = await testDataBuilder.createPermission(
        'update:test',
        'UPDATE_TEST',
        'Permissão de teste para atualização',
      );
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
      const permissao = await testDataBuilder.createPermission(
        'update:test-no-perms',
        'UPDATE_TEST_NO_PERMS',
        'Permissão de teste para atualização sem permissão',
      );
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

    it('deve restaurar uma permissão deletada via PATCH /permissoes/:id com { ativo: true }', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'restore:test',
          codigo: 'RESTORE_TEST',
          descricao: 'Permissão de teste para restauração',
          deletedAt: new Date(),
        },
      });
      const restoreDto = { ativo: true };

      return request(app.getHttpServer())
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(restoreDto)
        .expect(200)
        .expect(async (res) => {
          expect(res.body).toHaveProperty('id', permissao.id);
          expect(res.body.deletedAt).toBeNull();
          // Verify it's now accessible via normal GET
          await request(app.getHttpServer())
            .get(`/permissoes/${permissao.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        });
    });

    it('deve retornar 403 se não for admin ao tentar restaurar via PATCH', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'restore:test-no-admin',
          codigo: 'RESTORE_TEST_NO_ADMIN',
          descricao: 'Permissão de teste para restauração',
          deletedAt: new Date(),
        },
      });
      const restoreDto = { ativo: true };

      return request(app.getHttpServer())
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(restoreDto)
        .expect(403);
    });

    it('deve retornar 409 se tentar restaurar uma permissão não deletada via PATCH', async () => {
      const permissao = await testDataBuilder.createPermission(
        'non-deleted:test',
        'NON_DELETED_TEST',
        'Permissão de teste não deletada',
      );
      const restoreDto = { ativo: true };

      return request(app.getHttpServer())
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(restoreDto)
        .expect(409);
    });

    it('deve realizar soft delete de uma permissão via PATCH /permissoes/:id com { ativo: false }', async () => {
      const permissao = await testDataBuilder.createPermission(
        'softdelete:test',
        'SOFTDELETE_TEST',
        'Permissão de teste para soft delete',
      );
      const deleteDto = { ativo: false };

      return request(app.getHttpServer())
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(deleteDto)
        .expect(200)
        .expect(async (res) => {
          expect(res.body).toHaveProperty('id', permissao.id);
          expect(res.body.deletedAt).not.toBeNull();
          // Verify it's no longer accessible via normal GET
          await request(app.getHttpServer())
            .get(`/permissoes/${permissao.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(404);
        });
    });

    it('deve retornar 403 se não for admin ao tentar deletar via PATCH', async () => {
      const permissao = await testDataBuilder.createPermission(
        'softdelete:test-no-admin',
        'SOFTDELETE_TEST_NO_ADMIN',
        'Permissão de teste para soft delete sem admin',
      );
      const deleteDto = { ativo: false };

      return request(app.getHttpServer())
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(deleteDto)
        .expect(403);
    });

    it('deve retornar 409 se tentar deletar uma permissão já deletada via PATCH', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'already-deleted:test',
          codigo: 'ALREADY_DELETED_TEST',
          descricao: 'Permissão de teste já deletada',
          deletedAt: new Date(),
        },
      });
      const deleteDto = { ativo: false };

      return request(app.getHttpServer())
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(deleteDto)
        .expect(409);
    });
  });
});
