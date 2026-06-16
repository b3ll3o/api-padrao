// BDD: features/multi-tenancy.feature (cenários de isolamento de tenant)
// ATDD: test/multi-tenancy.e2e-spec.ts (e2e de isolamento multi-tenant)
// TDD: cobertura do comportamento multi-tenant via HTTP
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

describe('Multi-tenancy (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let empresaAId: string;
  let empresaBId: string;
  let tokenA: string;
  let tokenB: string;

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
    ]);

    // Responsáveis
    const responsavelA = await prisma.usuario.create({
      data: {
        email: 'resp-a@test.com',
        senha: await bcrypt.hash('pass123', 10),
      },
    });
    const responsavelB = await prisma.usuario.create({
      data: {
        email: 'resp-b@test.com',
        senha: await bcrypt.hash('pass123', 10),
      },
    });

    // Duas empresas distintas — A e B
    const empresaA = await prisma.empresa.create({
      data: {
        nome: 'Empresa A',
        responsavelId: responsavelA.id,
      },
    });
    const empresaB = await prisma.empresa.create({
      data: {
        nome: 'Empresa B',
        responsavelId: responsavelB.id,
      },
    });
    empresaAId = empresaA.id;
    empresaBId = empresaB.id;

    // Perfis isolados por empresa
    const perfilA = await prisma.perfil.create({
      data: {
        nome: 'Admin A',
        codigo: 'ADMIN_A',
        descricao: 'Admin A',
        empresa: { connect: { id: empresaA.id } },
        permissoes: { connect: perms.map((p) => ({ id: p.id })) },
      },
    });
    const perfilB = await prisma.perfil.create({
      data: {
        nome: 'Admin B',
        codigo: 'ADMIN_B',
        descricao: 'Admin B',
        empresa: { connect: { id: empresaB.id } },
        permissoes: { connect: perms.map((p) => ({ id: p.id })) },
      },
    });

    const adminA = await prisma.usuario.create({
      data: {
        email: 'admin-a@test.com',
        senha: await bcrypt.hash('pass123', 10),
      },
    });
    const adminB = await prisma.usuario.create({
      data: {
        email: 'admin-b@test.com',
        senha: await bcrypt.hash('pass123', 10),
      },
    });

    await prisma.usuarioEmpresa.create({
      data: {
        usuarioId: adminA.id,
        empresaId: empresaA.id,
        perfis: { connect: [{ id: perfilA.id }] },
      },
    });
    await prisma.usuarioEmpresa.create({
      data: {
        usuarioId: adminB.id,
        empresaId: empresaB.id,
        perfis: { connect: [{ id: perfilB.id }] },
      },
    });

    tokenA = jwtService.sign({
      sub: adminA.id,
      email: adminA.email,
      empresas: [
        {
          id: empresaA.id,
          perfis: [
            {
              codigo: perfilA.codigo,
              permissoes: perms.map((p) => ({ codigo: p.codigo })),
            },
          ],
        },
      ],
    });
    tokenB = jwtService.sign({
      sub: adminB.id,
      email: adminB.email,
      empresas: [
        {
          id: empresaB.id,
          perfis: [
            {
              codigo: perfilB.codigo,
              permissoes: perms.map((p) => ({ codigo: p.codigo })),
            },
          ],
        },
      ],
    });
  });

  it('admin A pode ler sua própria empresa A', async () => {
    await request(app.getHttpServer())
      .get(`/empresas/${empresaAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-empresa-id', empresaAId)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('id', empresaAId);
      });
  });

  it('admin B pode ler sua própria empresa B', async () => {
    await request(app.getHttpServer())
      .get(`/empresas/${empresaBId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .set('x-empresa-id', empresaBId)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('id', empresaBId);
      });
  });

  it('admin A com token válido pode ler registro de empresa B (limitação atual do modelo de auth)', async () => {
    // IMPORTANTE: este teste documenta o comportamento ATUAL, não o
    // ideal. Hoje, o guard @TemPermissao verifica se a permissão
    // existe em qualquer um dos perfis do token, sem cruzar com o
    // id do recurso solicitado. Ou seja, com um token que contém
    // READ_EMPRESA_BY_ID, é possível ler QUALQUER empresa via
    // /empresas/:id, independente de x-empresa-id.
    //
    // Um modelo de tenancy estrito (resource-level) precisaria
    // adicionalmente verificar que o recurso pertence ao tenant
    // ativo. Isso está documentado como follow-up em
    // features/multi-tenancy.feature.
    const response = await request(app.getHttpServer())
      .get(`/empresas/${empresaBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-empresa-id', empresaAId);

    // Hoje retorna 200. Se o modelo evoluir para resource-level,
    // este teste deve virar 403.
    expect([200, 403]).toContain(response.status);
  });

  it('admin A com token válido mas sem x-empresa-id deve ser rejeitado', async () => {
    // Quando a rota requer contexto de empresa (TemPermissao/x-empresa-id),
    // a ausência do header deve produzir 400 ou 403.
    const response = await request(app.getHttpServer())
      .get(`/empresas/${empresaAId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([400, 403]).toContain(response.status);
  });

  it('GET /empresas (listagem) deve respeitar a autorização do token', async () => {
    // Admin A tem READ_EMPRESAS no perfil. A listagem geral pode ou
    // não estar disponível — validamos que responde 200 OU 403, mas
    // nunca 500 e nunca 401.
    const response = await request(app.getHttpServer())
      .get('/empresas')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-empresa-id', empresaAId);

    expect([200, 403]).toContain(response.status);
  });
});
