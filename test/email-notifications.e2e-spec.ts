import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { createHash } from 'crypto';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase } from './e2e-utils';
import { LoggerEmailService } from '../src/shared/infrastructure/services/logger-email.service';
import { EMAIL_SERVICE } from '../src/shared/domain/services/email.service';
import { EMAIL_SENDER_SERVICE } from '../src/shared/application/services/email-sender.service';
import { JwtService } from '@nestjs/jwt';

/**
 * Testes E2E da feature Notificações por E-mail (email-notifications).
 *
 * Cobre AC-EM-01..14 listados em `.openspec/changes/email-notifications/design.md`:
 * - 5 triggers de envio (welcome, password_reset, password_changed, user_added, account_disabled)
 * - Anti-enumeração preservada no forgot-password
 * - Falha no envio NÃO bloqueia a request (não-bloqueio)
 * - Anti path-traversal no templateId
 * - Rodapé LGPD em todos os templates
 *
 * Estratégia de spy: troca a implementação registrada de `EMAIL_SERVICE` por um
 * mock local no `beforeEach` (via `Test.createTestingModule.overrideProvider`).
 * Isso permite contar chamadas e capturar argumentos sem depender de detalhes
 * internos do Pino. Após cada teste, o override é restaurado.
 */
describe('EmailNotifications (e2e) - SDD: design.md:REQ-EM-01..10, REQ-EM-N01..06', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let emailSpy: jest.Mock;

  /**
   * Helper para fazer setup completo antes de cada teste:
   * - reseta o banco
   * - cria empresa, perfis e usuário base para uso nos triggers
   */
  async function setupFixtures() {
    // Empresa
    const responsavel = await prisma.usuario.create({
      data: { email: 'responsavel@empresa.com' },
    });
    const empresa = await prisma.empresa.create({
      data: {
        nome: 'Empresa Teste',
        responsavelId: responsavel.id,
      },
    });
    // Perfis
    const perfilAdmin = await prisma.perfil.create({
      data: {
        nome: 'Admin',
        codigo: 'ADMIN',
        descricao: 'Administrador',
        empresa: { connect: { id: empresa.id } },
      },
    });
    const perfilOperador = await prisma.perfil.create({
      data: {
        nome: 'Operador',
        codigo: 'OPERADOR',
        descricao: 'Operador',
        empresa: { connect: { id: empresa.id } },
      },
    });

    return { responsavel, empresa, perfilAdmin, perfilOperador };
  }

  /**
   * Helper para criar um PasswordResetToken válido para um usuário.
   */
  function buildValidResetToken(userId: number) {
    const rawToken =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    return { rawToken, tokenHash, expiresAt, userId };
  }

  beforeAll(async () => {
    // Cria o TestingModule já sobrescrevendo o provider `EMAIL_SERVICE`
    // com um mock controlado. Isso permite que o `EmailSenderService`
    // (que depende do `EmailService` via DI) chame o `emailSpy` em vez
    // do `LoggerEmailService` real.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_SERVICE)
      .useFactory({
        factory: (): { send: jest.Mock } => {
          // O mock é criado por teste em `beforeEach` (via `installEmailSpy`).
          // Aqui só devolvemos um placeholder até o `installEmailSpy` ser chamado.
          return { send: jest.fn() };
        },
      })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { logger: false },
    );
    prisma = app.get<PrismaService>(PrismaService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const fastifyInstance = app.getHttpAdapter().getInstance();
    fastifyInstance.setErrorHandler((error: any, request, reply) => {
      // Preserva o body estruturado do BadRequestException e outros HttpException.
      // Sem isso, validation errors chegam como "Bad Request Exception" genérico.
      // Fastify: `code()` (NÃO `status()` — `status()` é API Express).
      if (
        error &&
        typeof error.getResponse === 'function' &&
        error.statusCode
      ) {
        reply.code(error.statusCode).send(error.getResponse());
        return;
      }
      reply.send(error);
    });

    await app.init();
    await fastifyInstance.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    // Reseta o spy a cada teste.
    emailSpy = jest.fn().mockResolvedValue(undefined);
    installEmailSpy();
  });

  /**
   * [SEC-002] Como POST /usuarios agora exige auth + permissão
   * CREATE_USUARIO, criamos um admin com essa permissão e emitimos
   * um JWT para uso nos testes. O `x-empresa-id` é obrigatório no
   * PermissaoGuard.
   */
  async function criarAdminComPermissoes(
    empresaId: string,
    perfilId: number,
    permissoesCodigos: string[],
  ) {
    const bcrypt = await import('bcrypt');
    const adminUser = await prisma.usuario.create({
      data: {
        email: 'admin@empresa.com',
        senha: await bcrypt.hash('AdminPass123!', 10),
      },
    });
    await prisma.usuarioEmpresa.create({
      data: {
        usuarioId: adminUser.id,
        empresaId,
        perfis: { connect: [{ id: perfilId }] },
      },
    });
    const jwtService = app.get(JwtService);
    return jwtService.sign({
      sub: adminUser.id,
      email: adminUser.email,
      empresas: [
        {
          id: empresaId,
          perfis: [
            {
              codigo: 'ADMIN',
              permissoes: permissoesCodigos.map((c) => ({ codigo: c })),
            },
          ],
        },
      ],
    });
  }

  /**
   * Substitui o EMAIL_SERVICE registrado no container por um mock que
   * registra todas as chamadas em `emailSpy`. Usado para validar que
   * `EmailSenderService` delega corretamente ao port.
   */
  function installEmailSpy() {
    // Como `overrideProvider` congela o provider no boot, o spy precisa
    // ser instalado mutando a referência interna do provider. Aqui
    // usamos o `app.get(EMAIL_SERVICE)` (que retorna o provider atual)
    // e sobrescrevemos a função `send` para delegar ao `emailSpy`.
    const emailServiceRef = app.get<{ send: jest.Mock }>(EMAIL_SERVICE);
    emailServiceRef.send = emailSpy;
  }

  // ============================================================
  // REQ-EM-01 + REQ-EM-06
  // ============================================================
  describe('POST /auth/forgot-password', () => {
    // BDD: features/email-notifications.feature:Cenário: E-mail de recuperação de senha continua sendo enviado via template auth.password_reset
    // AC-EM-04
    it('AC-EM-04: deve disparar emailSender.send com template auth.password_reset para e-mail válido', async () => {
      await prisma.usuario.create({
        data: { email: 'usuario@empresa.com', ativo: true },
      });

      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'usuario@empresa.com' })
        .expect(200);

      // REQ-EM-06 — o PasswordRecoveryService.forgotPassword DEVE chamar
      // `emailSenderService.send('auth.password_reset', ...)` após o refactor.
      // Hoje ele chama `emailService.send(...)` com body hard-coded — este
      // spec falha (Red Phase) até a implementação ser concluída.
      expect(emailSpy).toHaveBeenCalledTimes(1);
      const [message] = emailSpy.mock.calls[0];
      // Verifica indícios do template auth.password_reset (subject contém "Recuperação")
      expect(message.subject).toMatch(/recupera/i);
      expect(message.to).toBe('usuario@empresa.com');
    });

    // BDD: features/email-notifications.feature:Cenário: E-mail de recuperação preserva anti-enumeração
    // AC-EM-04b
    it('AC-EM-04b: NÃO deve chamar emailSender para e-mail inexistente (anti-enumeração)', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'naoexiste@empresa.com' })
        .expect(200);

      expect(emailSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // REQ-EM-03
  // ============================================================
  describe('POST /auth/reset-password', () => {
    // BDD: features/email-notifications.feature:Cenário: E-mail de confirmação enviado após reset de senha
    // AC-EM-03
    it('AC-EM-03: deve disparar emailSender.send com template usuarios.password_changed após reset bem-sucedido', async () => {
      const user = await prisma.usuario.create({
        data: { email: 'usuario@empresa.com', ativo: true },
      });
      const { rawToken, tokenHash, expiresAt, userId } = buildValidResetToken(
        user.id,
      );
      await prisma.passwordResetToken.create({
        data: { userId, tokenHash, expiresAt, usedAt: null },
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, novaSenha: 'NovaSenha123!' })
        .expect(200);

      // Espera-se 1 chamada (somente o e-mail de confirmação).
      // O e-mail de reset foi enviado no forgot-password, que NÃO é
      // chamado aqui. (Red Phase: ainda não implementado.)
      expect(emailSpy).toHaveBeenCalledTimes(1);
      const [message] = emailSpy.mock.calls[0];
      expect(message.subject).toMatch(/senha (foi )?alterada/i);
      expect(message.to).toBe('usuario@empresa.com');
    });
  });

  // ============================================================
  // REQ-EM-02 (welcome) + REQ-EM-07 (não bloqueia)
  // ============================================================
  describe('POST /usuarios', () => {
    // [SEC-002] Helper: cria empresa + admin com CREATE_USUARIO e
    // devolve headers (Authorization + x-empresa-id) para os testes
    // chamarem POST /usuarios com sucesso.
    async function adminAuthHeaders(): Promise<{
      auth: string;
      empresaId: string;
    }> {
      const { empresa, perfilAdmin } = await setupFixtures();
      const permissao = await prisma.permissao.upsert({
        where: { nome: 'create:usuario' },
        update: {},
        create: {
          nome: 'create:usuario',
          codigo: 'CREATE_USUARIO',
          descricao: 'Permissão para criar usuários',
        },
      });
      await prisma.perfil.update({
        where: { id: perfilAdmin.id },
        data: { permissoes: { connect: [{ id: permissao.id }] } },
      });
      const token = await criarAdminComPermissoes(empresa.id, perfilAdmin.id, [
        'CREATE_USUARIO',
      ]);
      return { auth: `Bearer ${token}`, empresaId: empresa.id };
    }

    // BDD: features/email-notifications.feature:Cenário: E-mail de boas-vindas enviado ao criar usuário
    // AC-EM-01
    it('AC-EM-01: deve disparar emailSender.send com template usuarios.welcome após criar usuário', async () => {
      const { auth, empresaId } = await adminAuthHeaders();
      const response = await request(app.getHttpServer())
        .post('/usuarios')
        .set('Authorization', auth)
        .set('x-empresa-id', empresaId)
        .send({
          email: 'novo.usuario@empresa.com',
          senha: 'SenhaForte123!',
        })
        .expect(201);

      expect(response.body.email).toBe('novo.usuario@empresa.com');

      // Red Phase: ainda não implementado. Quando estiver, esperam-se
      // 1 chamada com template "usuarios.welcome".
      expect(emailSpy).toHaveBeenCalledTimes(1);
      const [message] = emailSpy.mock.calls[0];
      expect(message.subject).toMatch(/bem.vindo/i);
      expect(message.to).toBe('novo.usuario@empresa.com');
      // Body deve conter o link para definir senha e o nome derivado do e-mail
      expect(message.body).toContain('novo.usuario');
      expect(message.body).toContain(
        'http://localhost:3000/auth/forgot-password',
      );
    });

    // BDD: features/email-notifications.feature:Cenário: Falha no envio NÃO bloqueia a request
    // AC-EM-06
    it('AC-EM-06: deve retornar 201 mesmo quando emailService.send() lança exceção', async () => {
      const { auth, empresaId } = await adminAuthHeaders();
      // Forçar falha no adapter
      emailSpy.mockRejectedValue(new Error('SMTP down'));

      // Spy no Logger para validar evento "email.failed" (warn)
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});

      const response = await request(app.getHttpServer())
        .post('/usuarios')
        .set('Authorization', auth)
        .set('x-empresa-id', empresaId)
        .send({ email: 'novo3@empresa.com', senha: 'SenhaForte123!' })
        .expect(201);

      // Request NÃO falha — usuário foi criado
      expect(response.body.email).toBe('novo3@empresa.com');

      // O send foi chamado (e a falha foi capturada pelo EmailSenderService)
      expect(emailSpy).toHaveBeenCalledTimes(1);

      // Log de warn com event: 'email.failed'
      const warnCalls = warnSpy.mock.calls.flat().map(String).join(' ');
      expect(warnCalls).toMatch(/email\.failed/);

      warnSpy.mockRestore();
    });
  });

  // ============================================================
  // REQ-EM-04 (user_added)
  // ============================================================
  describe('POST /empresas/:id/usuarios', () => {
    // BDD: features/email-notifications.feature:Cenário: E-mail de vínculo a empresa lista os perfis atribuídos
    // AC-EM-02
    it('AC-EM-02: deve disparar emailSender.send com template empresas.user_added e perfis resolvidos', async () => {
      const { empresa, perfilAdmin, perfilOperador } = await setupFixtures();

      // Cria um admin com permissão para chamar o endpoint
      const admin = await prisma.usuario.create({
        data: { email: 'admin@empresa.com' },
      });
      await prisma.usuarioEmpresa.create({
        data: {
          usuarioId: admin.id,
          empresaId: empresa.id,
          perfis: { connect: [{ id: perfilAdmin.id }] },
        },
      });

      // Usuário alvo do vínculo
      const target = await prisma.usuario.create({
        data: { email: 'novo@empresa.com' },
      });

      // Login como admin para obter token
      const jwtService = app.get<any>(JwtService);
      const adminToken = jwtService.sign({
        sub: admin.id,
        email: admin.email,
        empresas: [
          {
            id: empresa.id,
            perfis: [
              {
                codigo: perfilAdmin.codigo,
                permissoes: [{ codigo: 'ADD_USER_TO_EMPRESA' }],
              },
            ],
          },
        ],
      });

      // Adiciona permissão ADD_USER_TO_EMPRESA no setup
      // (em produção, viria via seed; aqui inserimos direto)
      const addUserPerm = await prisma.permissao.create({
        data: {
          nome: 'add:user_to_empresa',
          codigo: 'ADD_USER_TO_EMPRESA',
          descricao: 'Adicionar usuario a empresa',
        },
      });
      await prisma.perfil.update({
        where: { id: perfilAdmin.id },
        data: { permissoes: { connect: [{ id: addUserPerm.id }] } },
      });

      await request(app.getHttpServer())
        .post(`/empresas/${empresa.id}/usuarios`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', empresa.id)
        .send({
          usuarioId: target.id,
          perfilIds: [perfilAdmin.id, perfilOperador.id],
        })
        .expect(201);

      // Red Phase: trigger ainda não dispara e-mail. Quando implementar,
      // espera-se 1 chamada com template "empresas.user_added" e perfis
      // resolvidos como string "Admin, Operador".
      expect(emailSpy).toHaveBeenCalledTimes(1);
      const [message] = emailSpy.mock.calls[0];
      expect(message.subject).toMatch(/adicionado/i);
      expect(message.to).toBe('novo@empresa.com');
      expect(message.body).toContain('Admin');
      expect(message.body).toContain('Operador');
    });
  });

  // ============================================================
  // REQ-EM-05 (account_disabled)
  // ============================================================
  describe('PATCH /usuarios/:id (ativo=false)', () => {
    // BDD: features/email-notifications.feature:Cenário: E-mail de desativação enviado quando usuário é desativado
    // AC-EM-05
    it('AC-EM-05: deve disparar emailSender.send com template usuarios.account_disabled ao desativar', async () => {
      const { empresa, perfilAdmin } = await setupFixtures();
      const target = await prisma.usuario.create({
        data: { email: 'desativar@empresa.com', ativo: true },
      });

      const admin = await prisma.usuario.create({
        data: { email: 'admin@empresa.com' },
      });
      await prisma.usuarioEmpresa.create({
        data: {
          usuarioId: admin.id,
          empresaId: empresa.id,
          perfis: { connect: [{ id: perfilAdmin.id }] },
        },
      });

      const updatePerm = await prisma.permissao.create({
        data: {
          nome: 'update:usuario',
          codigo: 'UPDATE_USUARIO',
          descricao: 'Atualizar usuário',
        },
      });
      await prisma.perfil.update({
        where: { id: perfilAdmin.id },
        data: { permissoes: { connect: [{ id: updatePerm.id }] } },
      });

      const jwtService = app.get<any>(JwtService);
      const adminToken = jwtService.sign({
        sub: admin.id,
        email: admin.email,
        empresas: [
          {
            id: empresa.id,
            perfis: [
              {
                codigo: perfilAdmin.codigo,
                permissoes: [{ codigo: 'UPDATE_USUARIO' }],
              },
            ],
          },
        ],
      });

      await request(app.getHttpServer())
        .patch(`/usuarios/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-empresa-id', empresa.id)
        .send({ ativo: false })
        .expect(200);

      // Red Phase: trigger ainda não dispara e-mail. Quando implementar,
      // espera-se 1 chamada com template "usuarios.account_disabled".
      expect(emailSpy).toHaveBeenCalledTimes(1);
      const [message] = emailSpy.mock.calls[0];
      expect(message.subject).toMatch(/desativada/i);
      expect(message.to).toBe('desativar@empresa.com');
    });
  });

  // ============================================================
  // REQ-EM-09, REQ-EM-10 (EmailSenderService — unit-like via E2E)
  // ============================================================
  describe('EmailSenderService (orquestrador)', () => {
    // BDD: features/email-notifications.feature:Cenário: Renderer de template substitui placeholders corretamente
    // AC-EM-08 (positivo)
    it('AC-EM-08+: deve renderizar placeholders e injetar APP_NAME, APP_LOGIN_URL, ano_atual automaticamente', async () => {
      const sender = app.get<any>(EMAIL_SENDER_SERVICE);

      await sender.send('auth.password_reset', 'x@x.com', {
        nome: 'João',
        link: 'https://app/reset?token=abc',
        validade: '1 hora',
      });

      expect(emailSpy).toHaveBeenCalledTimes(1);
      const [message] = emailSpy.mock.calls[0];
      // APP_NAME injetado automaticamente
      expect(message.subject).toContain('API Padrão');
      // Variáveis do caller renderizadas
      expect(message.body).toContain('João');
      expect(message.body).toContain('https://app/reset?token=abc');
      expect(message.body).toContain('1 hora');
      // APP_LOGIN_URL injetado (link de descadastro)
      expect(message.body).toContain(
        'http://localhost:3000/account/unsubscribe',
      );
    });

    // BDD: features/email-notifications.feature:Cenário: Renderer lança erro se placeholder obrigatório está ausente em variables
    // AC-EM-08
    it('AC-EM-08: deve lançar erro se placeholder do template está faltando em variables', async () => {
      const sender = app.get<any>(EMAIL_SENDER_SERVICE);

      await expect(
        sender.send('auth.password_reset', 'x@x.com', {
          nome: 'João',
          link: 'https://app/reset?token=abc',
          // validade FALTANDO propositalmente
        }),
      ).rejects.toThrow(/Placeholder \{\{validade\}\}/);

      expect(emailSpy).not.toHaveBeenCalled();
    });

    // BDD: features/email-notifications.feature:Cenário: templateId inválido é rejeitado e logado
    // AC-EM-09
    it('AC-EM-09: deve fazer no-op e logar warn para templateId com caracteres inválidos (path-traversal)', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});

      const sender = app.get<any>(EMAIL_SENDER_SERVICE);

      await sender.send('../../etc/passwd', 'x@x.com', {});

      expect(emailSpy).not.toHaveBeenCalled();
      const warnCalls = warnSpy.mock.calls.flat().map(String).join(' ');
      expect(warnCalls).toMatch(/templateId inválido|whitelist/i);

      warnSpy.mockRestore();
    });

    // BDD: features/email-notifications.feature:Cenário: templateId fora da whitelist é rejeitado e logado
    // AC-EM-10
    it('AC-EM-10: deve fazer no-op e logar warn para templateId não em KNOWN_TEMPLATES', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});

      const sender = app.get<any>(EMAIL_SENDER_SERVICE);

      await sender.send('template_inexistente', 'x@x.com', {});

      expect(emailSpy).not.toHaveBeenCalled();
      const warnCalls = warnSpy.mock.calls.flat().map(String).join(' ');
      expect(warnCalls).toMatch(/template.*não.*whitelist|inválido/i);

      warnSpy.mockRestore();
    });
  });

  // ============================================================
  // REQ-EM-08 (templates versionados)
  // ============================================================
  describe('TemplateLoaderService (boot)', () => {
    // BDD: features/email-notifications.feature:Cenário: Aplicação não sobe se template obrigatório está ausente
    // AC-EM-07 (verificação estrutural)
    it('AC-EM-07: deve haver 5 templates v1/*.tpl no diretório', () => {
      // Verificação estrutural — não exercita o boot, apenas garante que os
      // arquivos físicos existem. O teste de boot com template faltando é
      // feito em unit spec de TemplateLoaderService.
      const templatesDir = join(
        process.cwd(),
        'src/shared/infrastructure/templates/v1',
      );
      expect(existsSync(templatesDir)).toBe(true);
      const files = readdirSync(templatesDir).filter((f) => f.endsWith('.tpl'));
      expect(files).toHaveLength(5);
    });

    // BDD: features/email-notifications.feature:Cenário: Rodapé LGPD presente em todos os 5 templates
    // AC-EM-12
    it('AC-EM-12: cada template deve conter "descadastro" e "dpo@" no body (LGPD)', () => {
      const templatesDir = join(
        process.cwd(),
        'src/shared/infrastructure/templates/v1',
      );
      const files = readdirSync(templatesDir).filter((f) => f.endsWith('.tpl'));
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const content = readFileSync(join(templatesDir, file), 'utf8');
        // Extrai o bloco "body:" até o final do arquivo
        const bodyMatch = content.match(/^body:\s*([\s\S]*)$/m);
        const body = bodyMatch ? bodyMatch[1] : content;
        expect(body).toMatch(/descadastro|unsubscribe/i);
        expect(body).toMatch(/dpo@/);
      }
    });
  });

  // ============================================================
  // REQ-EM-N02 (LoggerEmailService não vaza PII)
  // ============================================================
  describe('LoggerEmailService (adapter Pino)', () => {
    // BDD: features/email-notifications.feature:Cenário: LoggerEmailService NÃO loga body em NODE_ENV=production
    // AC-EM-11
    it('AC-EM-11: NÃO deve logar body em NODE_ENV=production', async () => {
      const originalEnv = process.env.NODE_ENV;
      // Não dá para mudar NODE_ENV dinamicamente para o adapter se ele
      // foi instanciado com o valor original. Este teste serve como
      // ACOMPANHAMENTO ao unit spec. O unit spec é a verificação
      // canônica (mocka o Logger).
      process.env.NODE_ENV = 'production';

      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      const adapter = new LoggerEmailService();
      await adapter.send({
        to: 'user@example.com',
        subject: 'Assunto',
        body: 'CORPO_SECRETO_TOKEN_RESET',
      });

      // Em produção, body NÃO deve aparecer nos logs
      const allCalls = logSpy.mock.calls.flat().map(String).join(' ');
      expect(allCalls).not.toContain('CORPO_SECRETO_TOKEN_RESET');
      // Mas to e subject DEVEM aparecer
      expect(allCalls).toContain('user@example.com');
      expect(allCalls).toContain('Assunto');

      logSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });
  });
});
