import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { cleanDatabase } from './e2e-utils';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

describe('PerfisController (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let adminToken: string;
  let globalEmpresaId: string;
  let adminUser: any;

  beforeAll(async () => {
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication<NestFastifyApplication>(
        new FastifyAdapter(),
        {
          logger: ['error', 'warn', 'log', 'debug', 'verbose'],
        },
      );
      prisma = app.get<PrismaService>(PrismaService);
      // Habilita logs do prisma via $on se possível, ou garante que o serviço esteja configurado
      jwtService = app.get<JwtService>(JwtService);

      // Injeta logger de erro global no Fastify para testes (DEVE ser antes do init/listen)
      app
        .getHttpAdapter()
        .getInstance()
        .setErrorHandler((error: any, request: any, reply: any) => {
          console.error('--- FASTIFY ERROR ---');
          console.error('URL:', request.url);
          console.error('Error:', error);
          if (error && (error as any).stack)
            console.error('Stack:', (error as any).stack);
          console.error('---------------------');
          reply.status(500).send({ message: error.message });
        });

      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    } catch (error) {
      console.error('--- BEFORE ALL ERROR ---');
      console.error(error);
      console.error('------------------------');
      throw error;
    }
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Setup: Criar usuário responsável primeiro
    adminUser = await prisma.usuario.create({
      data: {
        email: 'responsavel-e2e@example.com',
        senha: 'password123',
        ativo: true,
      },
    });

    // Setup: Criar empresa com responsável
    const empresa = await prisma.empresa.create({
      data: {
        nome: 'Empresa Teste E2E',
        descricao: 'Descrição da empresa de teste',
        responsavelId: adminUser.id,
        ativo: true,
      },
    });
    globalEmpresaId = empresa.id;

    // Setup: Criar permissões necessárias
    await prisma.permissao.createMany({
      data: [
        {
          nome: 'Criar Perfil',
          codigo: 'CREATE_PERFIL',
          descricao: 'Permite criar perfis',
        },
        {
          nome: 'Ler Perfis',
          codigo: 'READ_PERFIS',
          descricao: 'Permite listar perfis',
        },
        {
          nome: 'Ler Perfil por ID',
          codigo: 'READ_PERFIL_BY_ID',
          descricao: 'Permite ver detalhes de um perfil',
        },
        {
          nome: 'Atualizar Perfil',
          codigo: 'UPDATE_PERFIL',
          descricao: 'Permite atualizar perfis',
        },
      ],
    });

    const permissoes = await prisma.permissao.findMany();

    // Setup: Criar perfil ADMIN com todas as permissões (N:N relation)
    const adminPerfil = await prisma.perfil.create({
      data: {
        nome: 'Administrador',
        codigo: 'ADMIN',
        descricao: 'Perfil de administrador do sistema',
        empresaId: globalEmpresaId,
        permissoes: {
          connect: permissoes.map((p) => ({ id: p.id })),
        },
      },
    });

    // Vincular adminUser à empresa e perfil no UsuarioEmpresa
    await prisma.usuarioEmpresa.create({
      data: {
        usuarioId: adminUser.id,
        empresaId: globalEmpresaId,
        perfis: {
          connect: { id: adminPerfil.id },
        },
      },
    });

    // Gerar token real para os testes
    adminToken = jwtService.sign({
      sub: adminUser.id,
      email: adminUser.email,
      empresaId: globalEmpresaId,
      empresas: [
        {
          id: globalEmpresaId,
          perfis: [
            {
              codigo: 'ADMIN',
              permissoes: permissoes.map((p) => ({ codigo: p.codigo })),
            },
          ],
        },
      ],
    });
  });

  describe('POST /perfis', () => {
    it('deve criar um novo perfil com sucesso', async () => {
      const dto = {
        nome: 'Novo Perfil',
        codigo: 'NOVO_PERFIL',
        descricao: 'Descrição do novo perfil',
        empresaId: globalEmpresaId,
        permissoesIds: [],
      };

      return request(app.getHttpServer())
        .post('/perfis')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .send(dto)
        .expect((res) => {
          if (res.status !== 201) {
            console.log('--- ERROR LOG ---');
            console.log('Status:', res.status);
            console.log('Body:', JSON.stringify(res.body, null, 2));
            console.log('-----------------');
          }
        })
        .expect(201);
    });

    it('deve retornar 409 se o perfil com o mesmo nome já existir na mesma empresa', async () => {
      const dto = {
        nome: 'Perfil Duplicado',
        descricao: 'Descrição duplicada',
        empresaId: globalEmpresaId,
      };

      // Criar o primeiro
      await prisma.perfil.create({
        data: {
          nome: dto.nome,
          codigo: 'DUPLICADO',
          descricao: dto.descricao,
          empresaId: globalEmpresaId,
        },
      });

      // Tentar criar o segundo
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
          nome: 'Perfil Busca',
          codigo: 'BUSCA',
          descricao: 'Perfil para busca',
          empresaId: globalEmpresaId,
        },
      });

      return request(app.getHttpServer())
        .get(`/perfis/${perfil.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', globalEmpresaId)
        .expect(200);
    });
  });

  describe('PATCH /perfis/:id', () => {
    it('deve atualizar um perfil', async () => {
      const perfil = await prisma.perfil.create({
        data: {
          nome: 'Perfil Antigo',
          codigo: 'ANTIGO',
          descricao: 'Descrição antiga',
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
          nome: 'Perfil Deletado',
          codigo: 'DELETADO',
          descricao: 'Descrição deletado',
          empresaId: globalEmpresaId,
          deletedAt: new Date(),
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
