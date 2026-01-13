import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { cleanDatabase } from './e2e-utils';
import * as bcrypt from 'bcrypt';

describe('EmpresasController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let adminToken: string;
  let adminUser: any;

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
    await cleanDatabase(prisma);

    // Setup: Criar permissões para o módulo de empresas
    const perms = await Promise.all([
      prisma.permissao.create({
        data: {
          nome: 'create:empresa',
          codigo: 'CREATE_EMPRESA',
          descricao: 'Criar empresa',
        },
      }),
      prisma.permissao.create({
        data: {
          nome: 'read:empresas',
          codigo: 'READ_EMPRESAS',
          descricao: 'Ler empresas',
        },
      }),
      prisma.permissao.create({
        data: {
          nome: 'read:empresa_by_id',
          codigo: 'READ_EMPRESA_BY_ID',
          descricao: 'Ler empresa por id',
        },
      }),
      prisma.permissao.create({
        data: {
          nome: 'update:empresa',
          codigo: 'UPDATE_EMPRESA',
          descricao: 'Atualizar empresa',
        },
      }),
      prisma.permissao.create({
        data: {
          nome: 'delete:empresa',
          codigo: 'DELETE_EMPRESA',
          descricao: 'Remover empresa',
        },
      }),
      prisma.permissao.create({
        data: {
          nome: 'add:user_to_empresa',
          codigo: 'ADD_USER_TO_EMPRESA',
          descricao: 'Adicionar usuario a empresa',
        },
      }),
    ]);

    // Criar perfil admin com essas permissões
    const adminProfile = await prisma.perfil.create({
      data: {
        nome: 'Admin Empresas',
        codigo: 'ADMIN_EMPRESAS',
        descricao: 'Admin de empresas',
        permissoes: { connect: perms.map((p) => ({ id: p.id })) },
      },
      include: { permissoes: true },
    });

    // Criar usuário admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    adminUser = await prisma.usuario.create({
      data: {
        email: 'admin_empresas@example.com',
        senha: hashedPassword,
      },
    });

    // Gerar token simulando o perfil (como fizemos no fix anterior dos e2e)
    adminToken = jwtService.sign({
      sub: adminUser.id,
      email: adminUser.email,
      perfis: [adminProfile],
    });

    // Usuário sem permissões
    const userWithoutPerms = await prisma.usuario.create({
      data: { email: 'no_perms@example.com' },
    });
    userToken = jwtService.sign({
      sub: userWithoutPerms.id,
      email: userWithoutPerms.email,
      perfis: [],
    });
  });

  let userToken: string;

  describe('Segurança e Autorização', () => {
    it('deve retornar 401 ao tentar criar empresa sem token', () => {
      return request(app.getHttpServer())
        .post('/empresas')
        .send({ nome: 'Hack', responsavelId: 1 })
        .expect(401);
    });

    it('deve retornar 403 ao tentar criar empresa sem permissão', () => {
      return request(app.getHttpServer())
        .post('/empresas')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ nome: 'Hack', responsavelId: 1 })
        .expect(403);
    });

    it('deve retornar 403 ao tentar listar empresas sem permissão', () => {
      return request(app.getHttpServer())
        .get('/empresas')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('Cenários de Erro e Casos de Borda', () => {
    it('deve retornar 404 ao tentar atualizar empresa que não existe', () => {
      return request(app.getHttpServer())
        .patch('/empresas/non-existent-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nome: 'New Name' })
        .expect(404);
    });

    it('deve retornar 404 ao tentar deletar empresa que não existe', () => {
      return request(app.getHttpServer())
        .delete('/empresas/non-existent-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('deve retornar 404 ao tentar adicionar usuário a empresa que não existe', () => {
      return request(app.getHttpServer())
        .post('/empresas/non-existent-uuid/usuarios')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ usuarioId: 1, perfilIds: [1] })
        .expect(404);
    });

    it('deve falhar ao buscar empresa que sofreu soft delete', async () => {
      const empresa = await prisma.empresa.create({
        data: { nome: 'To Delete', responsavelId: adminUser.id },
      });

      await request(app.getHttpServer())
        .delete(`/empresas/${empresa.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      return request(app.getHttpServer())
        .get(`/empresas/${empresa.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('POST /empresas', () => {
    it('deve criar uma nova empresa', async () => {
      const createDto = {
        nome: 'Tech Solutions',
        descricao: 'Empresa de TI',
        responsavelId: adminUser.id,
      };

      const res = await request(app.getHttpServer())
        .post('/empresas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createDto)
        .expect(201);

      expect(res.body.nome).toBe(createDto.nome);
      expect(res.body.responsavelId).toBe(adminUser.id);
      expect(res.body.ativo).toBe(true);
    });

    it('deve retornar 400 se o nome estiver faltando', () => {
      return request(app.getHttpServer())
        .post('/empresas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ responsavelId: adminUser.id })
        .expect(400);
    });
  });

  describe('GET /empresas', () => {
    it('deve listar empresas paginadas', async () => {
      await prisma.empresa.create({
        data: { nome: 'Empresa 1', responsavelId: adminUser.id },
      });

      const res = await request(app.getHttpServer())
        .get('/empresas')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /empresas/:id', () => {
    it('deve retornar uma empresa por ID', async () => {
      const empresa = await prisma.empresa.create({
        data: { nome: 'Tech', responsavelId: adminUser.id },
      });

      const res = await request(app.getHttpServer())
        .get(`/empresas/${empresa.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(empresa.id);
    });

    it('deve retornar 404 para ID inexistente', () => {
      return request(app.getHttpServer())
        .get('/empresas/non-existent-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /empresas/:id', () => {
    it('deve atualizar o nome da empresa', async () => {
      const empresa = await prisma.empresa.create({
        data: { nome: 'Old Name', responsavelId: adminUser.id },
      });

      const res = await request(app.getHttpServer())
        .patch(`/empresas/${empresa.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nome: 'New Name' })
        .expect(200);

      expect(res.body.nome).toBe('New Name');
    });
  });

  describe('DELETE /empresas/:id', () => {
    it('deve realizar soft delete', async () => {
      const empresa = await prisma.empresa.create({
        data: { nome: 'To Delete', responsavelId: adminUser.id },
      });

      await request(app.getHttpServer())
        .delete(`/empresas/${empresa.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verificar no banco se deletou logicamente
      const dbEmpresa = await prisma.empresa.findUnique({
        where: { id: empresa.id },
      });
      expect(dbEmpresa?.deletedAt).not.toBeNull();
      expect(dbEmpresa?.ativo).toBe(false);
    });
  });

  describe('POST /empresas/:id/usuarios', () => {
    it('deve vincular usuário a empresa com perfis', async () => {
      const empresa = await prisma.empresa.create({
        data: { nome: 'Cloud Tech', responsavelId: adminUser.id },
      });

      const user = await prisma.usuario.create({
        data: { email: 'staff@example.com' },
      });

      const profile = await prisma.perfil.create({
        data: {
          nome: 'Staff',
          codigo: 'STAFF',
          descricao: 'Equipe',
        },
      });

      await request(app.getHttpServer())
        .post(`/empresas/${empresa.id}/usuarios`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          usuarioId: user.id,
          perfilIds: [profile.id],
        })
        .expect(201);

      // Verificar vinculo
      const link = await prisma.usuarioEmpresa.findFirst({
        where: { usuarioId: user.id, empresaId: empresa.id },
        include: { perfis: true },
      });

      expect(link).toBeDefined();
      expect(link?.perfis).toHaveLength(1);
      expect(link?.perfis[0].codigo).toBe('STAFF');
    });

    it('deve atualizar perfis se o vínculo já existir', async () => {
      const empresa = await prisma.empresa.create({
        data: { nome: 'Cloud Tech', responsavelId: adminUser.id },
      });

      const user = await prisma.usuario.create({
        data: { email: 'staff2@example.com' },
      });

      const profile1 = await prisma.perfil.create({
        data: { nome: 'P1', codigo: 'P1', descricao: 'D1' },
      });

      const profile2 = await prisma.perfil.create({
        data: { nome: 'P2', codigo: 'P2', descricao: 'D2' },
      });

      // Primeiro vínculo
      await prisma.usuarioEmpresa.create({
        data: {
          usuarioId: user.id,
          empresaId: empresa.id,
          perfis: { connect: [{ id: profile1.id }] },
        },
      });

      // Atualizar para profile2
      await request(app.getHttpServer())
        .post(`/empresas/${empresa.id}/usuarios`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          usuarioId: user.id,
          perfilIds: [profile2.id],
        })
        .expect(201);

      const link = await prisma.usuarioEmpresa.findFirst({
        where: { usuarioId: user.id, empresaId: empresa.id },
        include: { perfis: true },
      });

      expect(link?.perfis).toHaveLength(1);
      expect(link?.perfis[0].codigo).toBe('P2');
    });

    it('deve retornar 404 se o usuário não existir', async () => {
      const empresa = await prisma.empresa.create({
        data: { nome: 'Cloud Tech', responsavelId: adminUser.id },
      });

      await request(app.getHttpServer())
        .post(`/empresas/${empresa.id}/usuarios`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          usuarioId: 9999,
          perfilIds: [1],
        })
        .expect(404);
    });

    it('deve retornar 404 se um perfil não existir', async () => {
      const empresa = await prisma.empresa.create({
        data: { nome: 'Cloud Tech', responsavelId: adminUser.id },
      });

      const user = await prisma.usuario.create({
        data: { email: 'staff3@example.com' },
      });

      await request(app.getHttpServer())
        .post(`/empresas/${empresa.id}/usuarios`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          usuarioId: user.id,
          perfilIds: [9999],
        })
        .expect(404);
    });

    it('deve retornar 403 se o usuário não tiver permissão ADD_USER_TO_EMPRESA', async () => {
      const empresa = await prisma.empresa.create({
        data: { nome: 'Cloud Tech', responsavelId: adminUser.id },
      });

      await request(app.getHttpServer())
        .post(`/empresas/${empresa.id}/usuarios`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          usuarioId: 1,
          perfilIds: [1],
        })
        .expect(403);
    });
  });
});
