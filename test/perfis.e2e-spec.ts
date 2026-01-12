import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaginatedResponseDto } from '../src/shared/dto/paginated-response.dto';
import { Perfil } from '../src/perfis/domain/entities/perfil.entity';
import { cleanDatabase } from './e2e-utils';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt'; // Import JwtService

describe('PerfisController (e2e)', () => {
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
        nome: 'read:users',
        codigo: 'READ_USERS',
        descricao: 'Permissão para ler usuários',
      },
      {
        nome: 'write:users',
        codigo: 'WRITE_USERS',
        descricao: 'Permissão para escrever usuários',
      },
      {
        nome: 'create:perfis',
        codigo: 'CREATE_PERFIL',
        descricao: 'Permissão para criar perfis',
      },
      {
        nome: 'read:perfis',
        codigo: 'READ_PERFIS',
        descricao: 'Permissão para ler perfis',
      },
      {
        nome: 'read:perfis_by_id',
        codigo: 'READ_PERFIL_BY_ID',
        descricao: 'Permissão para ler perfis por id',
      },
      {
        nome: 'read:perfis_by_nome',
        codigo: 'READ_PERFIL_BY_NOME',
        descricao: 'Permissão para ler perfis por nome',
      },
      {
        nome: 'update:perfis',
        codigo: 'UPDATE_PERFIL',
        descricao: 'Permissão para atualizar perfis',
      },
      {
        nome: 'delete:perfis',
        codigo: 'DELETE_PERFIL',
        descricao: 'Permissão para deletar perfis',
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
    const adminUser = await prisma.usuario.create({
      data: {
        email: 'admin@example.com',
        senha: hashedPassword,
        // No direct profile connection
      },
    });

    // Manually sign token for admin with profile included
    adminToken = jwtService.sign({
      sub: adminUser.id,
      email: adminUser.email,
      perfis: [adminProfile],
    });

    // Setup for a regular user with limited permissions
    const limitedPerms = await prisma.permissao.create({
      data: {
        nome: 'read:limited_resource',
        codigo: 'READ_LIMITED_RESOURCE',
        descricao: 'Permissão para ler um recurso limitado',
      },
    });
    let limitedProfile = await prisma.perfil.create({
      data: {
        nome: 'LimitedUser',
        codigo: 'LIMITED_USER',
        descricao: 'Perfil de usuário com acesso limitado',
        permissoes: {
          connect: { id: limitedPerms.id },
        },
      },
    });
    // Fetch full profile with perms
    limitedProfile = await prisma.perfil.findUniqueOrThrow({
      where: { id: limitedProfile.id },
      include: { permissoes: true },
    });

    const limitedUserHashedPassword = await bcrypt.hash('Limited123!', 10);
    const limitedUser = await prisma.usuario.create({
      data: {
        email: 'limited@example.com',
        senha: limitedUserHashedPassword,
        // No direct profile connection
      },
    });
    userToken = jwtService.sign({
      sub: limitedUser.id,
      email: limitedUser.email,
      perfis: [limitedProfile],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  describe('POST /perfis', () => {
    it('deve criar um perfil', async () => {
      const createPerfilDto = {
        nome: `Admin-${Date.now()}`,
        codigo: `ADMIN_${Date.now()}`,
        descricao: 'Perfil de administrador',
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

    it('deve retornar 403 se o usuário não tiver permissão para criar perfil', () => {
      const createPerfilDto = {
        nome: `NoPerms-${Date.now()}`,
        codigo: `NO_PERMS_${Date.now()}`,
        descricao: 'Perfil sem permissão',
      };
      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createPerfilDto)
        .expect(403);
    });

    it('deve retornar 400 se o nome estiver faltando', () => {
      const createPerfilDto = {};

      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPerfilDto)
        .expect(400);
    });

    it('deve retornar 409 se o perfil com o mesmo nome já existir', async () => {
      const createPerfilDto = {
        nome: 'duplicate:name',
        codigo: 'DUPLICATE_NAME',
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
            `Perfil com o nome '${createPerfilDto.nome}' já existe.`,
          );
        });
    });

    it('deve retornar 404 se as permissões não existirem', async () => {
      const createPerfilDto = {
        nome: 'Perfil com Permissões Inválidas',
        codigo: 'PERFIL_PERMISSOES_INVALIDAS',
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
      await prisma.perfil.create({
        data: {
          nome: 'User',
          codigo: 'USER',
          descricao: 'Perfil de usuário comum',
        },
      });

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
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'Editor',
          codigo: 'EDITOR',
          descricao: 'Perfil de editor',
        },
      });

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
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'Editor',
          codigo: 'EDITOR',
          descricao: 'Perfil de editor',
        },
      });
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
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'Viewer',
          codigo: 'VIEWER',
          descricao: 'Perfil de visualizador',
        },
      });
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
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'Viewer',
          codigo: 'VIEWER',
          descricao: 'Perfil de visualizador',
        },
      });
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
          nome: 'restore:test',
          codigo: 'RESTORE_TEST',
          descricao: 'Perfil de teste para restauração',
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
          expect(updatedPerfil).not.toBeNull(); // Add this check
          if (updatedPerfil) {
            // Add this check
            expect(updatedPerfil.deletedAt).not.toBeNull();
          }
        });
    });

    it('deve retornar 409 se tentar restaurar um perfil não deletado via PATCH', async () => {
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'non-deleted:test',
          codigo: 'NON_DELETED_TEST',
          descricao: 'Perfil de teste não deletado',
        },
      });
      const restoreDto = { ativo: true };

      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(restoreDto)
        .expect(409);
    });

    it('deve realizar soft delete de um perfil via PATCH /perfis/:id com { ativo: false }', async () => {
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'softdelete:test',
          codigo: 'SOFTDELETE_TEST',
          descricao: 'Perfil de teste para soft delete',
        },
      });
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
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'softdelete:test',
          codigo: 'SOFTDELETE_TEST',
          descricao: 'Perfil de teste para soft delete',
        },
      });
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
      await prisma.perfil.createMany({
        data: [
          {
            nome: 'perfil_teste_1',
            codigo: 'PERFIL_TESTE_1',
            descricao: 'Perfil de teste 1',
          },
          {
            nome: 'outro_perfil',
            codigo: 'OUTRO_PERFIL',
            descricao: 'Outro perfil de teste',
          },
          {
            nome: 'perfil_teste_2',
            codigo: 'PERFIL_TESTE_2',
            descricao: 'Perfil de teste 2',
          },
        ],
      });
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
