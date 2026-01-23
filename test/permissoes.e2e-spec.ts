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
  let adminToken: string;
  let userToken: string;
  let globalEmpresaId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    const jwtService = app.get<JwtService>(JwtService);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();

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

    // Create an admin user first to be responsavel
    const adminUser = await prisma.usuario.create({
      data: {
        email: 'admin@example.com',
        senha: await bcrypt.hash('admin123', 10),
      },
    });

    // Create a company
    const empresa = await prisma.empresa.create({
      data: {
        nome: 'Empresa Teste',
        responsavelId: adminUser.id,
      },
    });
    globalEmpresaId = empresa.id;

    let adminProfile = await prisma.perfil.create({
      data: {
        nome: 'Admin',
        codigo: 'ADMIN',
        descricao: 'Perfil de administrador',
        empresa: { connect: { id: globalEmpresaId } },
        permissoes: {
          connect: permissions.map((p) => ({ id: p.id })),
        },
      },
    });
    adminProfile = await prisma.perfil.findUniqueOrThrow({
      where: { id: adminProfile.id },
      include: { permissoes: true },
    });

    // Vincular admin à empresa
    await prisma.usuarioEmpresa.create({
      data: {
        usuarioId: adminUser.id,
        empresaId: globalEmpresaId,
        perfis: { connect: [{ id: adminProfile.id }] },
      },
    });

    // Manually sign admin token
    adminToken = jwtService.sign({
      sub: adminUser.id,
      email: adminUser.email,
      empresas: [
        {
          id: globalEmpresaId,
          perfis: [
            {
              codigo: adminProfile.codigo,
              permissoes: (adminProfile as any).permissoes.map((p: any) => ({
                codigo: p.codigo,
              })),
            },
          ],
        },
      ],
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
        empresa: { connect: { id: globalEmpresaId } },
        permissoes: {
          connect: { id: limitedPerms.id },
        },
      },
    });
    limitedProfile = await prisma.perfil.findUniqueOrThrow({
      where: { id: limitedProfile.id },
      include: { permissoes: true },
    });

    const limitedUser = await prisma.usuario.create({
      data: {
        email: 'limited@example.com',
        senha: await bcrypt.hash('Limited123!', 10),
      },
    });

    // Vincular limitedUser à empresa
    await prisma.usuarioEmpresa.create({
      data: {
        usuarioId: limitedUser.id,
        empresaId: globalEmpresaId,
        perfis: { connect: [{ id: limitedProfile.id }] },
      },
    });

    userToken = jwtService.sign({
      sub: limitedUser.id,
      email: limitedUser.email,
      empresas: [
        {
          id: globalEmpresaId,
          perfis: [
            {
              codigo: limitedProfile.codigo,
              permissoes: (limitedProfile as any).permissoes.map((p: any) => ({
                codigo: p.codigo,
              })),
            },
          ],
        },
      ],
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
        .set('x-empresa-id', globalEmpresaId)
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
        .set('x-empresa-id', globalEmpresaId)
        .send(createPermissaoDto)
        .expect(403);
    });

    it('deve retornar 400 se o nome estiver faltando', () => {
      const createPermissaoDto = {};

      return request(app.getHttpServer())
        .post('/permissoes')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
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
        .set('x-empresa-id', globalEmpresaId)
        .send(createPermissaoDto)
        .expect(201);

      // Tentar criar uma permissão duplicada
      return request(app.getHttpServer())
        .post('/permissoes')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
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
        .set('x-empresa-id', globalEmpresaId)
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
        .set('x-empresa-id', globalEmpresaId)
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
        .set('x-empresa-id', globalEmpresaId)
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
        .set('x-empresa-id', globalEmpresaId)
        .expect(403);
    });

    it('deve retornar 404 se a permissão não for encontrada', () => {
      return request(app.getHttpServer())
        .get('/permissoes/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
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
        .set('x-empresa-id', globalEmpresaId)
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
        .set('x-empresa-id', globalEmpresaId)
        .expect(403);
    });

    it('deve retornar um array vazio se nenhuma permissão for encontrada', () => {
      const paginationDto = { page: 1, limit: 10 };

      return request(app.getHttpServer())
        .get('/permissoes/nome/naoexiste')
        .query(paginationDto) // Add query parameters
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
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
        .set('x-empresa-id', globalEmpresaId)
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
        .set('x-empresa-id', globalEmpresaId)
        .send(updatePermissaoDto)
        .expect(403);
    });

    it('deve retornar 404 se a permissão a ser atualizada não for encontrada', () => {
      const updatePermissaoDto = { nome: 'nonexistent:update' };
      return request(app.getHttpServer())
        .patch('/permissoes/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
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
        .set('x-empresa-id', globalEmpresaId)
        .send(restoreDto)
        .expect(200)
        .expect(async (res) => {
          expect(res.body).toHaveProperty('id', permissao.id);
          expect(res.body.deletedAt).toBeNull();
          expect(res.body.ativo).toBe(true);
        });
    });

    it('deve retornar 403 se não for admin ao tentar restaurar via PATCH', async () => {
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
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(restoreDto)
        .expect(403);
    });

    it('deve retornar 409 se tentar restaurar uma permissão não deletada via PATCH', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'non-deleted:test',
          codigo: 'NON_DELETED_TEST',
          descricao: 'Permissão de teste não deletada',
        },
      });
      const restoreDto = { ativo: true };

      return request(app.getHttpServer())
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(restoreDto)
        .expect(409);
    });

    it('deve realizar soft delete de uma permissão via PATCH /permissoes/:id com { ativo: false }', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'softdelete:test',
          codigo: 'SOFTDELETE_TEST',
          descricao: 'Permissão de teste para soft delete',
        },
      });
      const deleteDto = { ativo: false };

      return request(app.getHttpServer())
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(deleteDto)
        .expect(200)
        .expect(async (res) => {
          expect(res.body).toHaveProperty('id', permissao.id);
          expect(res.body.deletedAt).not.toBeNull();
        });
    });

    it('deve retornar 403 se não for admin ao tentar deletar via PATCH', async () => {
      const permissao = await prisma.permissao.create({
        data: {
          nome: 'softdelete:test',
          codigo: 'SOFTDELETE_TEST',
          descricao: 'Permissão de teste para soft delete',
        },
      });
      const deleteDto = { ativo: false };

      return request(app.getHttpServer())
        .patch(`/permissoes/${permissao.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-empresa-id', globalEmpresaId)
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
        .set('x-empresa-id', globalEmpresaId)
        .send(deleteDto)
        .expect(409);
    });
  });
});
