import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaginatedResponseDto } from '../src/shared/dto/paginated-response.dto';
import { Perfil } from '../src/perfis/domain/entities/perfil.entity';
import { cleanDatabase, setupE2ETestData } from './e2e-utils';
import { TestDataBuilder } from './test-data-builder';

describe('PerfisController (e2e)', () => {
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
    await prisma.perfil.deleteMany({
      where: {
        codigo: {
          notIn: ['ADMIN', 'LIMITED_USER'],
        },
      },
    });
  });

  describe('POST /perfis', () => {
    it('deve criar um perfil', async () => {
      const createPerfilDto = {
        nome: `Test Perfil ${Date.now()}`,
        codigo: `TEST_PERFIL_${Date.now()}`,
        descricao: 'Perfil de teste',
      };

      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPerfilDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.nome).toEqual(createPerfilDto.nome);
        });
    });

    it('deve retornar 403 se o usuário não tiver permissão para criar perfil', async () => {
      const createPerfilDto = {
        nome: `NoPermsPerfil ${Date.now()}`,
        codigo: `NO_PERMS_PERFIL_${Date.now()}`,
        descricao: 'Perfil sem permissão',
      };
      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createPerfilDto)
        .expect(403);
    });

    it('deve retornar 400 se o nome estiver faltando', () => {
      const createPerfilDto = {
        codigo: `MISSING_NAME_${Date.now()}`,
        descricao: 'Descrição',
      };

      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPerfilDto)
        .expect(400);
    });

    it('deve retornar 409 se o perfil com o mesmo nome já existir', async () => {
      const uniqueName = `DuplicatePerfil ${Date.now()}`;
      const createPerfilDto = {
        nome: uniqueName,
        codigo: `DUPLICATE_PERFIL_${Date.now()}`,
        descricao: 'Perfil duplicado',
      };
      await request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPerfilDto)
        .expect(201);

      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPerfilDto)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toEqual(
            `Perfil com o nome '${uniqueName}' já existe.`,
          );
        });
    });

    it('deve retornar 404 se as permissões não existirem', async () => {
      const createPerfilDto = {
        nome: `PerfilComPermissoesInvalidas ${Date.now()}`,
        codigo: `PERFIL_INVALID_PERMS_${Date.now()}`,
        descricao: 'Perfil com permissões que não existem',
        permissoesIds: [99999],
      };

      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPerfilDto)
        .expect(404)
        .expect((res) => {
          expect(res.body.message).toEqual(
            'Permissão com ID 99999 não encontrada.',
          );
        });
    });
  });

  describe('GET /perfis', () => {
    it('deve retornar uma lista paginada de perfis', async () => {
      await testDataBuilder.createProfile(
        'User',
        'USER_PROFILE',
        'Perfil de usuário comum',
      );

      return request(app.getHttpServer())
        .get('/perfis')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const paginatedResponse = res.body as PaginatedResponseDto<Perfil>;
          expect(paginatedResponse).toHaveProperty('data');
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toBeGreaterThan(0);
          expect(paginatedResponse).toHaveProperty('total');
          expect(typeof paginatedResponse.total).toBe('number');
        });
    });

    it('deve retornar 403 se o usuário não tiver permissão para ler perfis', () => {
      return request(app.getHttpServer())
        .get('/perfis')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('GET /perfis/:id', () => {
    it('deve retornar um único perfil', async () => {
      const perfil = await testDataBuilder.createProfile(
        'Editor',
        'EDITOR_PROFILE',
        'Perfil de editor',
      );

      return request(app.getHttpServer())
        .get(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', perfil.id);
          expect(res.body.nome).toEqual(perfil.nome);
        });
    });

    it('deve retornar 403 se o usuário não tiver permissão para ler perfil por ID', async () => {
      const perfil = await testDataBuilder.createProfile(
        'EditorNoPerms',
        'EDITOR_NO_PERMS',
        'Perfil de editor sem permissão',
      );
      return request(app.getHttpServer())
        .get(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('deve retornar 404 se o perfil não for encontrado', () => {
      return request(app.getHttpServer())
        .get('/perfis/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /perfis/:id', () => {
    it('deve atualizar um perfil', async () => {
      const perfil = await testDataBuilder.createProfile(
        'Viewer',
        'VIEWER_PROFILE',
        'Perfil de visualizador',
      );
      const updatePerfilDto = { nome: 'Updated Viewer' };

      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatePerfilDto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', perfil.id);
          expect(res.body.nome).toEqual(updatePerfilDto.nome);
        });
    });

    it('deve retornar 403 se o usuário não tiver permissão para atualizar perfil', async () => {
      const perfil = await testDataBuilder.createProfile(
        'ViewerNoPerms',
        'VIEWER_NO_PERMS',
        'Perfil de visualizador sem permissão',
      );
      const updatePerfilDto = { nome: 'Updated Viewer' };
      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updatePerfilDto)
        .expect(403);
    });

    it('deve retornar 404 se o perfil não for encontrado', () => {
      const updatePerfilDto = { nome: 'Non Existent' };

      return request(app.getHttpServer())
        .patch('/perfis/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatePerfilDto)
        .expect(404);
    });

    it('deve restaurar um perfil deletado via PATCH /perfis/:id com { ativo: true }', async () => {
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'restore:test',
          codigo: 'RESTORE_TEST',
          descricao: 'Perfil de teste para restauração',
          deletedAt: new Date(),
        },
      });
      const restoreDto = { ativo: true };

      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(restoreDto)
        .expect(200)
        .expect(async (res) => {
          expect(res.body).toHaveProperty('id', perfil.id);
          expect(res.body.deletedAt).toBeNull();
          // Verify it's now accessible via normal GET
          await request(app.getHttpServer())
            .get(`/perfis/${perfil.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        });
    });

    it('deve retornar 403 se não for admin ao tentar restaurar via PATCH', async () => {
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'restore:test-no-admin',
          codigo: 'RESTORE_TEST_NO_ADMIN',
          descricao: 'Perfil de teste para restauração sem admin',
          deletedAt: new Date(),
        },
      });
      const restoreDto = { ativo: true };

      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(restoreDto)
        .expect(403)
        .expect(async () => {
          // Verify it's still not accessible via normal GET
          const updatedPerfil = await prisma.perfil.findUnique({
            where: { id: perfil.id },
            select: { deletedAt: true },
          });
          expect(updatedPerfil).not.toBeNull();
          if (updatedPerfil) {
            expect(updatedPerfil.deletedAt).not.toBeNull();
          }
        });
    });

    it('deve retornar 409 se tentar restaurar um perfil não deletado via PATCH', async () => {
      const perfil = await testDataBuilder.createProfile(
        'non-deleted:test',
        'NON_DELETED_TEST',
        'Perfil de teste não deletado',
      );
      const restoreDto = { ativo: true };

      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(restoreDto)
        .expect(409);
    });

    it('deve realizar soft delete de um perfil via PATCH /perfis/:id com { ativo: false }', async () => {
      const perfil = await testDataBuilder.createProfile(
        'softdelete:test',
        'SOFTDELETE_TEST',
        'Perfil de teste para soft delete',
      );
      const deleteDto = { ativo: false };

      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(deleteDto)
        .expect(200)
        .expect(async (res) => {
          expect(res.body).toHaveProperty('id', perfil.id);
          expect(res.body.deletedAt).not.toBeNull();
          // Verify it's no longer accessible via normal GET
          await request(app.getHttpServer())
            .get(`/perfis/${perfil.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(404);
        });
    });

    it('deve retornar 403 se não for admin ao tentar deletar via PATCH', async () => {
      const perfil = await testDataBuilder.createProfile(
        'softdelete:test-no-admin',
        'SOFTDELETE_TEST_NO_ADMIN',
        'Perfil de teste para soft delete sem admin',
      );
      const deleteDto = { ativo: false };

      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(deleteDto)
        .expect(403);
    });

    it('deve retornar 409 se tentar deletar um perfil já deletado via PATCH', async () => {
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'already-deleted:test',
          codigo: 'ALREADY_DELETED_TEST',
          descricao: 'Perfil de teste já deletado',
          deletedAt: new Date(),
        },
      });
      const deleteDto = { ativo: false };

      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(deleteDto)
        .expect(409);
    });
  });

  describe('GET /perfis/nome/:nome', () => {
    it('deve retornar perfis que contêm a string no nome', async () => {
      await testDataBuilder.createProfile(
        'perfil_teste_1',
        'PERFIL_TESTE_1',
        'Perfil de teste 1',
      );
      await testDataBuilder.createProfile(
        'outro_perfil',
        'OUTRO_PERFIL',
        'Outro perfil de teste',
      );
      await testDataBuilder.createProfile(
        'perfil_teste_2',
        'PERFIL_TESTE_2',
        'Perfil de teste 2',
      );
      const paginationDto = { page: 1, limit: 10 };

      return request(app.getHttpServer())
        .get('/perfis/nome/teste')
        .query(paginationDto) // Add query parameters
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const paginatedResponse = res.body as PaginatedResponseDto<Perfil>;
          expect(paginatedResponse).toHaveProperty('data');
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toEqual(2);
          expect(paginatedResponse.data[0].nome).toContain('teste');
          expect(paginatedResponse.data[1].nome).toContain('teste');
          expect(paginatedResponse).toHaveProperty('total');
          expect(typeof paginatedResponse.total).toBe('number');
        });
    });

    it('deve retornar 403 se o usuário não tiver permissão para ler perfis por nome', () => {
      const paginationDto = { page: 1, limit: 10 };
      return request(app.getHttpServer())
        .get('/perfis/nome/teste')
        .query(paginationDto)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('deve retornar um array vazio se nenhum perfil for encontrado', () => {
      const paginationDto = { page: 1, limit: 10 };

      return request(app.getHttpServer())
        .get('/perfis/nome/naoexiste')
        .query(paginationDto) // Add query parameters
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const paginatedResponse = res.body as PaginatedResponseDto<Perfil>;
          expect(paginatedResponse).toHaveProperty('data');
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toEqual(0);
          expect(paginatedResponse).toHaveProperty('total');
          expect(typeof paginatedResponse.total).toBe('number');
        });
    });
  });
});
