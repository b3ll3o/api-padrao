import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertestRequest from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { cleanDatabase } from './e2e-utils';
import * as bcrypt from 'bcrypt';

// Helper function to create admin user and profile, connecting to existing permissions
async function setupAdminUserAndProfile(
  prisma: PrismaService,
  jwtService: JwtService,
  adminProfileId: number,
  empresaId: string,
) {
  // Create an admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.usuario.create({
    data: {
      email: 'admin@example.com',
      senha: hashedPassword,
    },
  });

  // Fetch the profile
  const adminProfile = await prisma.perfil.findUnique({
    where: { id: adminProfileId },
    include: { permissoes: true },
  });

  if (!adminProfile) throw new Error('Admin profile not found');

  // Vincular admin à empresa
  await prisma.usuarioEmpresa.create({
    data: {
      usuarioId: adminUser.id,
      empresaId: empresaId,
      perfis: { connect: [{ id: adminProfileId }] },
    },
  });

  // Login as admin to get a token with manually injected context
  const adminToken = jwtService.sign({
    sub: adminUser.id,
    email: adminUser.email,
    empresas: [
      {
        id: empresaId,
        perfis: [
          {
            codigo: adminProfile.codigo,
            permissoes: adminProfile.permissoes.map((p) => ({
              codigo: p.codigo,
            })),
          },
        ],
      },
    ],
  });

  return { adminUser, adminToken };
}

async function findOrCreatePermissao(
  prisma: PrismaService,
  data: { nome: string; codigo: string; descricao: string },
) {
  let permissao = await prisma.permissao.findUnique({
    where: { nome: data.nome },
  });
  if (!permissao) {
    permissao = await prisma.permissao.create({ data });
  }
  return permissao;
}

async function findOrCreatePerfil(
  prisma: PrismaService,
  data: {
    nome: string;
    codigo: string;
    descricao: string;
    permissoes?: any;
    empresaId: string;
  },
) {
  let perfil = await prisma.perfil.findFirst({
    where: { nome: data.nome, empresaId: data.empresaId },
  });
  if (!perfil) {
    const { empresaId, ...perfilData } = data;
    perfil = await prisma.perfil.create({
      data: {
        ...perfilData,
        empresa: { connect: { id: empresaId } },
      },
    });
  }
  return perfil;
}

describe('UsuariosController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let adminToken: string;
  let globalEmpresaId: string;
  let user1: any;
  let user1Token: string;

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

    // Setup de permissões globais
    const readUsuarioByIdPerm = await findOrCreatePermissao(prisma, {
      nome: 'read:usuario_by_id',
      codigo: 'READ_USUARIO_BY_ID',
      descricao: 'Permissão para ler usuários por ID',
    });
    const deleteUsuarioPerm = await findOrCreatePermissao(prisma, {
      nome: 'delete:usuario',
      codigo: 'DELETE_USUARIO',
      descricao: 'Permissão para deletar usuários',
    });
    const updateUsuarioPerm = await findOrCreatePermissao(prisma, {
      nome: 'update:usuario',
      codigo: 'UPDATE_USUARIO',
      descricao: 'Permissão para atualizar usuários',
    });
    const readUsuarioEmpresasPerm = await findOrCreatePermissao(prisma, {
      nome: 'read:usuario_empresas',
      codigo: 'READ_USUARIO_EMPRESAS',
      descricao: 'Permissão para ler empresas de um usuário',
    });

    // Criar um usuário responsável para a empresa global
    const responsavel = await prisma.usuario.create({
      data: {
        email: 'responsavel@example.com',
      },
    });

    // Criar uma empresa global para os testes
    const empresa = await prisma.empresa.create({
      data: {
        nome: 'Empresa Teste',
        responsavelId: responsavel.id,
      },
    });
    globalEmpresaId = empresa.id;

    // Create an admin profile
    const adminProfile = await findOrCreatePerfil(prisma, {
      nome: 'Admin',
      codigo: 'ADMIN',
      descricao: 'Perfil de administrador',
      empresaId: globalEmpresaId,
      permissoes: {
        connect: [
          { id: readUsuarioByIdPerm.id },
          { id: deleteUsuarioPerm.id },
          { id: updateUsuarioPerm.id },
          { id: readUsuarioEmpresasPerm.id },
        ],
      },
    });

    // Setup Admin
    const adminSetup = await setupAdminUserAndProfile(
      prisma,
      jwtService,
      adminProfile.id,
      globalEmpresaId,
    );
    adminToken = adminSetup.adminToken;

    // Setup User1
    const userProfile = await findOrCreatePerfil(prisma, {
      nome: 'User',
      codigo: 'USER',
      descricao: 'Perfil de usuário comum',
      empresaId: globalEmpresaId,
      permissoes: {
        connect: [
          { id: readUsuarioByIdPerm.id },
          { id: readUsuarioEmpresasPerm.id },
          { id: updateUsuarioPerm.id },
        ],
      },
    });

    user1 = await prisma.usuario.create({
      data: {
        email: 'user1@example.com',
        senha: await bcrypt.hash('Password123!', 10),
      },
    });

    await prisma.usuarioEmpresa.create({
      data: {
        usuarioId: user1.id,
        empresaId: globalEmpresaId,
        perfis: { connect: [{ id: userProfile.id }] },
      },
    });

    user1Token = jwtService.sign({
      sub: user1.id,
      email: user1.email,
      empresas: [
        {
          id: globalEmpresaId,
          perfis: [
            {
              codigo: userProfile.codigo,
              permissoes: [
                { codigo: 'READ_USUARIO_BY_ID' },
                { codigo: 'READ_USUARIO_EMPRESAS' },
                { codigo: 'UPDATE_USUARIO' },
              ],
            },
          ],
        },
      ],
    });
  });

  describe('POST /usuarios', () => {
    it('deve criar um usuário e retornar 201', () => {
      const createUserDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(201)
        .then((res) => {
          expect(res.body).toEqual({
            id: expect.any(Number),
            email: 'test@example.com',
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            deletedAt: null,
            ativo: true,
            empresas: [],
          });
        });
    });

    it('deve retornar 409 se o email já existir', async () => {
      const createUserDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };

      // Criar o primeiro usuário
      await prisma.usuario.create({ data: createUserDto });

      // Tentar criar o segundo usuário com o mesmo email
      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(409);
    });

    it('deve retornar 400 se o email for inválido', () => {
      const createUserDto = { email: 'invalid-email', senha: 'Password123!' };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400);
    });

    it('deve retornar 400 se a senha for muito curta', () => {
      const createUserDto = { email: 'test@example.com', senha: '123' };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400);
    });

    it('deve retornar 400 se a senha não atender aos requisitos de complexidade', () => {
      const createUserDto = {
        email: 'test@example.com',
        senha: 'password',
      };

      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400);
    });

    it('deve retornar 400 se o email estiver faltando', () => {
      const createUserDto = { senha: 'Password123!' };
      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('E-mail inválido'); // Changed expected message
        });
    });

    it('deve retornar 400 se a senha estiver faltando', () => {
      const createUserDto = { email: 'missing_password@example.com' };
      return supertestRequest(app.getHttpServer())
        .post('/usuarios')
        .send(createUserDto)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('A senha não pode ser vazia');
        });
    });
  });

  describe('GET /usuarios/:id', () => {
    let user2;
    let deletedUser;

    beforeEach(async () => {
      user2 = await prisma.usuario.create({
        data: {
          email: 'user2@example.com',
          senha: await bcrypt.hash('Password123!', 10),
        },
      });

      deletedUser = await prisma.usuario.create({
        data: {
          email: 'deleted@example.com',
          senha: await bcrypt.hash('Password123!', 10),
          deletedAt: new Date(),
        },
      });
    });

    it('deve permitir que um usuário acesse seus próprios dados', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${user1.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('x-empresa-id', globalEmpresaId)
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual({
            id: user1.id,
            email: user1.email,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            deletedAt: null,
            ativo: true,
            empresas: expect.any(Array),
          });
        });
    });

    it('deve retornar 403 quando um usuário tenta acessar dados de outro usuário', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${user2.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('x-empresa-id', globalEmpresaId)
        .expect(403)
        .then((res) => {
          expect(res.body.message).toBe(
            'Você não tem permissão para acessar os dados deste usuário',
          );
        });
    });

    it('deve retornar 401 quando não há token de autenticação', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${user1.id}`)
        .expect(401);
    });

    it('deve retornar 404 quando o usuário não existe', () => {
      return supertestRequest(app.getHttpServer())
        .get('/usuarios/99999')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('x-empresa-id', globalEmpresaId)
        .expect(404)
        .then((res) => {
          expect(res.body.message).toBe('Usuário com ID 99999 não encontrado');
        });
    });

    it('deve permitir que um admin acesse os dados de outro usuário', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${user1.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual({
            id: user1.id,
            email: user1.email,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            deletedAt: null,
            ativo: true,
            empresas: expect.any(Array),
          });
        });
    });

    it('deve retornar 404 para um usuário deletado por padrão', () => {
      return supertestRequest(app.getHttpServer())
        .get(`/usuarios/${deletedUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .expect(404)
        .then((res) => {
          expect(res.body.message).toBe(
            `Usuário com ID ${deletedUser.id} não encontrado`,
          );
        });
    });
  });

  describe('PATCH /usuarios/:id', () => {
    let userToUpdate;
    let userToSoftDelete;

    beforeEach(async () => {
      userToUpdate = await prisma.usuario.create({
        data: {
          email: 'update_me@example.com',
          senha: await bcrypt.hash('Password123!', 10),
        },
      });

      userToSoftDelete = await prisma.usuario.create({
        data: {
          email: 'soft_deleted@example.com',
          senha: await bcrypt.hash('Password123!', 10),
          deletedAt: new Date(),
        },
      });
    });

    it('deve permitir que um usuário atualize seus próprios dados', () => {
      const updateDto = { email: 'updated_email@example.com' };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${user1.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(updateDto)
        .expect(200)
        .then((res) => {
          expect(res.body.email).toBe('updated_email@example.com');
        });
    });

    it('deve permitir que um admin atualize os dados de outro usuário', async () => {
      const updateDto = { email: 'admin_updated@example.com' };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToUpdate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(updateDto)
        .expect(200)
        .then((res) => {
          expect(res.body.email).toBe('admin_updated@example.com');
        });
    });

    it('deve retornar 403 quando um usuário tenta atualizar dados de outro usuário', async () => {
      const anotherUser = await prisma.usuario.create({
        data: {
          email: 'another_user@example.com',
          senha: await bcrypt.hash('Password123!', 10),
        },
      });
      const updateDto = { email: 'forbidden_update@example.com' };

      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${anotherUser.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(updateDto)
        .expect(403);
    });

    it('deve retornar 404 quando o usuário a ser atualizado não existe', () => {
      const updateDto = { email: 'nonexistent_update@example.com' };
      return supertestRequest(app.getHttpServer())
        .patch('/usuarios/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(updateDto)
        .expect(404);
    });

    it('deve restaurar um usuário deletado via PATCH /usuarios/:id com { ativo: true }', async () => {
      const restoreDto = { ativo: true };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToSoftDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(restoreDto)
        .expect(200)
        .then(async (res) => {
          expect(res.body.id).toBe(userToSoftDelete.id);
          expect(res.body.deletedAt).toBeNull();
          // Verify it's now accessible via normal GET
          await supertestRequest(app.getHttpServer())
            .get(`/usuarios/${userToSoftDelete.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-empresa-id', globalEmpresaId)
            .expect(200);
        });
    });

    it('deve retornar 403 se não for admin ao tentar restaurar via PATCH', async () => {
      const restoreDto = { ativo: true };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToSoftDelete.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(restoreDto)
        .expect(403);
    });

    it('deve retornar 409 se tentar restaurar um usuário não deletado via PATCH', async () => {
      const restoreDto = { ativo: true };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToUpdate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(restoreDto)
        .expect(409);
    });

    it('deve realizar soft delete de um usuário via PATCH /usuarios/:id com { ativo: false }', async () => {
      const deleteDto = { ativo: false };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToUpdate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(deleteDto)
        .expect(200)
        .then(async (res) => {
          expect(res.body.id).toBe(userToUpdate.id);
          expect(res.body.deletedAt).not.toBeNull();
          // Verify it's no longer accessible via normal GET
          await supertestRequest(app.getHttpServer())
            .get(`/usuarios/${userToUpdate.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-empresa-id', globalEmpresaId)
            .expect(404);
        });
    });

    it('deve retornar 403 se não for admin ao tentar deletar via PATCH', async () => {
      const deleteDto = { ativo: false };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToUpdate.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(deleteDto)
        .expect(403);
    });

    it('deve retornar 409 se tentar deletar um usuário já deletado via PATCH', async () => {
      const deleteDto = { ativo: false };
      return supertestRequest(app.getHttpServer())
        .patch(`/usuarios/${userToSoftDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(deleteDto)
        .expect(409);
    });
  });

  describe('GET /usuarios/:id/empresas', () => {
    it('deve listar empresas de um usuário', async () => {
      // Setup já criou user1 vinculado à globalEmpresaId no beforeEach do describe pai ou aqui
      // Vamos usar o user1Token e globalEmpresaId

      const res = await supertestRequest(app.getHttpServer())
        .get(`/usuarios/${user1.id}/empresas`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('x-empresa-id', globalEmpresaId)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.data[0].nome).toBe('Empresa Teste');
    });
  });
});
