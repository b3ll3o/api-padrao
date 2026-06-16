// BDD: features/soft-delete.feature (cenários de soft-delete)
// ATDD: test/soft-delete.e2e-spec.ts (e2e de soft-delete via Prisma extension)
// TDD: cobertura do comportamento de soft-delete via HTTP
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { cleanDatabase } from './e2e-utils';
import * as bcrypt from 'bcrypt';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

describe('Soft-delete (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let token: string;
  let empresaId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { logger: false },
    );
    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Permissões necessárias para os endpoints exercitados
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
          nome: 'read:empresa_by_id',
          codigo: 'READ_EMPRESA_BY_ID',
          descricao: 'Ler empresa por id',
        },
      }),
      prisma.permissao.create({
        data: {
          nome: 'delete:empresa',
          codigo: 'DELETE_EMPRESA',
          descricao: 'Remover empresa',
        },
      }),
    ]);

    const responsavel = await prisma.usuario.create({
      data: {
        email: 'resp@test.com',
        senha: await bcrypt.hash('password123', 10),
      },
    });

    const empresa = await prisma.empresa.create({
      data: {
        nome: 'Empresa SoftDelete',
        responsavelId: responsavel.id,
      },
    });
    empresaId = empresa.id;

    const admin = await prisma.usuario.create({
      data: {
        email: 'admin@test.com',
        senha: await bcrypt.hash('admin123', 10),
      },
    });

    const perfil = await prisma.perfil.create({
      data: {
        nome: 'Admin SoftDelete',
        codigo: 'ADMIN_SD',
        descricao: 'Admin para soft-delete',
        empresa: { connect: { id: empresa.id } },
        permissoes: { connect: perms.map((p) => ({ id: p.id })) },
      },
    });

    await prisma.usuarioEmpresa.create({
      data: {
        usuarioId: admin.id,
        empresaId: empresa.id,
        perfis: { connect: [{ id: perfil.id }] },
      },
    });

    token = jwtService.sign({
      sub: admin.id,
      email: admin.email,
      empresas: [
        {
          id: empresa.id,
          perfis: [
            {
              codigo: perfil.codigo,
              permissoes: perms.map((p) => ({ codigo: p.codigo })),
            },
          ],
        },
      ],
    });
  });

  it('DELETE /empresas/:id deve soft-deletar (ativo=false, deletedAt != null)', async () => {
    await request(app.getHttpServer())
      .delete(`/empresas/${empresaId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-empresa-id', empresaId)
      .expect(204);

    // Verifica no banco: registro ainda existe (soft-delete), mas
    // ativo=false e deletedAt preenchido.
    const row = await prisma.empresa.findUnique({
      where: { id: empresaId },
    });

    expect(row).not.toBeNull();
    expect(row).toHaveProperty('ativo', false);
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });

  it('após soft-delete, registro NÃO aparece via prisma.extended (extension remove soft-deleted)', async () => {
    await request(app.getHttpServer())
      .delete(`/empresas/${empresaId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-empresa-id', empresaId)
      .expect(204);

    // O PrismaService expõe `prisma.extended` com a extension de
    // soft-delete. findFirst através do extended client DEVE filtrar
    // registros com deletedAt != null. A diferença entre
    // prisma.empresa.* e prisma.extended.empresa.* é exatamente o
    // que estamos testando.
    const visible = await (prisma.extended as any).empresa.findFirst({
      where: { id: empresaId },
    });
    expect(visible).toBeNull();
  });

  it('soft-delete é idempotente: chamar DELETE duas vezes não falha a 2ª', async () => {
    await request(app.getHttpServer())
      .delete(`/empresas/${empresaId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-empresa-id', empresaId)
      .expect(204);

    // Segunda chamada — registro já está soft-deletado. Comportamento
    // esperado: ainda retorna 204 (idempotente) ou 404 (not found).
    // O que NÃO pode acontecer: 500.
    const second = await request(app.getHttpServer())
      .delete(`/empresas/${empresaId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-empresa-id', empresaId);

    expect([204, 404]).toContain(second.status);
  });
});
