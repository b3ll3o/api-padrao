import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase } from './e2e-utils';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

describe('PerfisController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let adminToken: string;
  let globalEmpresaId: string;

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

    const permissionsData = [
      { nome: 'create:perfis', codigo: 'CREATE_PERFIL', descricao: 'Criar' },
      { nome: 'read:perfis', codigo: 'READ_PERFIS', descricao: 'Ler' },
      {
        nome: 'read:perfis_by_id',
        codigo: 'READ_PERFIL_BY_ID',
        descricao: 'ID',
      },
      {
        nome: 'update:perfis',
        codigo: 'UPDATE_PERFIL',
        descricao: 'Atualizar',
      },
    ];
    const permissions = await Promise.all(
      permissionsData.map((p) => prisma.permissao.create({ data: p })),
    );

    const responsavel = await prisma.usuario.create({
      data: { email: 'resp@test.com' },
    });

    const empresa = await prisma.empresa.create({
      data: { nome: 'Empresa Teste', responsavelId: responsavel.id },
    });
    globalEmpresaId = empresa.id;

    const adminProfile = await prisma.perfil.create({
      data: {
        nome: 'Admin',
        codigo: 'ADMIN',
        descricao: 'Admin',
        empresaId: globalEmpresaId,
        permissoes: { connect: permissions.map((p) => ({ id: p.id })) },
      },
      include: { permissoes: true },
    });

    const adminUser = await prisma.usuario.create({
      data: {
        email: 'admin@test.com',
        senha: await bcrypt.hash('admin123', 10),
        empresas: {
          create: {
            empresaId: globalEmpresaId,
            perfis: { connect: { id: adminProfile.id } },
          },
        },
      },
    });

    adminToken = jwtService.sign({
      sub: adminUser.id,
      email: adminUser.email,
      empresas: [
        {
          id: globalEmpresaId,
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
  });

  describe('POST /perfis', () => {
    it('deve criar um perfil', async () => {
      const dto = {
        nome: 'Novo Perfil',
        codigo: 'NOVO',
        descricao: 'Desc',
        empresaId: globalEmpresaId,
      };

      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(dto)
        .expect(201);
    });

    it('deve retornar 409 se o perfil com o mesmo nome já existir na mesma empresa', async () => {
      const dto = {
        nome: 'Repetido',
        codigo: 'REPETIDO',
        descricao: 'Desc',
        empresaId: globalEmpresaId,
      };
      await prisma.perfil.create({
        data: { ...dto, empresaId: globalEmpresaId },
      });

      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(dto)
        .expect(409);
    });
  });

  describe('GET /perfis', () => {
    it('deve retornar uma lista paginada de perfis', async () => {
      return request(app.getHttpServer())
        .get('/perfis')
        .query({ empresaId: globalEmpresaId })
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toBeInstanceOf(Array);
        });
    });
  });

  describe('GET /perfis/:id', () => {
    it('deve retornar um único perfil', async () => {
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'ID',
          codigo: 'ID',
          descricao: 'ID',
          empresaId: globalEmpresaId,
        },
      });

      return request(app.getHttpServer())
        .get(`/perfis/${perfil.id}`)
        .query({ empresaId: globalEmpresaId })
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .expect(200);
    });
  });

  describe('PATCH /perfis/:id', () => {
    it('deve atualizar um perfil', async () => {
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'U',
          codigo: 'U',
          descricao: 'U',
          empresaId: globalEmpresaId,
        },
      });

      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send({ nome: 'Atualizado' })
        .expect(200);
    });

    it('deve restaurar um perfil deletado', async () => {
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'R',
          codigo: 'R',
          descricao: 'R',
          deletedAt: new Date(),
          ativo: false,
          empresaId: globalEmpresaId,
        },
      });

      return request(app.getHttpServer())
        .patch(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send({ ativo: true })
        .expect(200);
    });
  });
});
