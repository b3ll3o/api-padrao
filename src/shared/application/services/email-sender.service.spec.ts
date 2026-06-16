// BDD: features/email-notifications.feature:Cenário: Renderer de template substitui placeholders corretamente
// BDD: features/email-notifications.feature:Cenário: templateId inválido é rejeitado e logado
// SDD: .openspec/changes/email-notifications/design.md:REQ-EM-07, REQ-EM-09, REQ-EM-10, REQ-EM-N01
// ATDD: test/email-notifications.e2e-spec.ts:EmailSenderService (orquestrador)
// TDD: cobertura do EmailSenderService
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DefaultEmailSenderService } from './email-sender.service';
import {
  EmailTemplate,
  TemplateLoaderService,
} from '../../infrastructure/services/template-loader.service';
import { EmailService } from '../../domain/services/email.service';

describe('DefaultEmailSenderService (REQ-EM-07, REQ-EM-09, REQ-EM-10)', () => {
  let service: DefaultEmailSenderService;
  let emailService: jest.Mocked<EmailService>;
  let templateLoader: jest.Mocked<TemplateLoaderService>;
  let configService: jest.Mocked<ConfigService>;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  const fakeTemplate: EmailTemplate = {
    templateId: 'auth.password_reset',
    subject: 'Recuperação - {{APP_NAME}}',
    body: 'Olá {{nome}}, link: {{link}}, validade: {{validade}}. Para descadastro, acesse {{APP_LOGIN_URL}}/x. dpo@{{APP_NAME}}. © {{ano_atual}}',
  };

  beforeEach(() => {
    emailService = { send: jest.fn().mockResolvedValue(undefined) };
    templateLoader = {
      loadAll: jest.fn(),
      get: jest.fn().mockReturnValue(fakeTemplate),
      list: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<TemplateLoaderService>;
    configService = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          APP_NAME: 'API Padrão',
          APP_LOGIN_URL: 'http://localhost:3000',
          EMAIL_NOTIFICATIONS_ENABLED: 'true',
        };
        return map[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new DefaultEmailSenderService(
      emailService,
      templateLoader,
      configService,
    );

    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('deve ser uma instância de DefaultEmailSenderService', () => {
    expect(service).toBeInstanceOf(DefaultEmailSenderService);
  });

  // REQ-EM-09
  it('deve renderizar placeholders e chamar emailService.send', async () => {
    await service.send('auth.password_reset', 'a@b.c', {
      nome: 'João',
      link: 'https://app/reset?token=abc',
      validade: '1h',
    });

    expect(emailService.send).toHaveBeenCalledTimes(1);
    const [message] = emailService.send.mock.calls[0];
    expect(message.to).toBe('a@b.c');
    expect(message.subject).toContain('API Padrão');
    expect(message.body).toContain('João');
    expect(message.body).toContain('https://app/reset?token=abc');
    expect(message.body).toContain('1h');
  });

  // REQ-EM-09
  it('deve injetar automaticamente {{APP_NAME}}, {{APP_LOGIN_URL}} e {{ano_atual}}', async () => {
    await service.send('auth.password_reset', 'a@b.c', {
      nome: 'X',
      link: 'L',
      validade: 'V',
    });
    const [message] = emailService.send.mock.calls[0];
    expect(message.body).toContain('API Padrão');
    expect(message.body).toContain('http://localhost:3000');
    expect(message.body).toContain(String(new Date().getFullYear()));
  });

  // REQ-EM-09 (fail-fast de authoring)
  it('deve lançar erro se placeholder do template está faltando em variables', async () => {
    await expect(
      service.send('auth.password_reset', 'a@b.c', {
        nome: 'X',
        link: 'L',
        // validade FALTANDO
      }),
    ).rejects.toThrow(/Placeholder \{\{validade\}\}/);
    expect(emailService.send).not.toHaveBeenCalled();
  });

  // REQ-EM-07
  it('deve capturar exceção do emailService e retornar void sem throw', async () => {
    emailService.send.mockRejectedValue(new Error('SMTP down'));
    await expect(
      service.send('auth.password_reset', 'a@b.c', {
        nome: 'X',
        link: 'L',
        validade: 'V',
      }),
    ).resolves.toBeUndefined();
    const events = warnSpy.mock.calls
      .flat()
      .filter((c) => typeof c === 'object' && c !== null)
      .map((c: any) => c.event);
    expect(events).toContain('email.failed');
  });

  // REQ-EM-07 (Edge case - non-Error rejection)
  it('deve capturar rejection não-Error e logar como String(err)', async () => {
    emailService.send.mockRejectedValue('erro string' as any);
    await expect(
      service.send('auth.password_reset', 'a@b.c', {
        nome: 'X',
        link: 'L',
        validade: 'V',
      }),
    ).resolves.toBeUndefined();
    const events = warnSpy.mock.calls
      .flat()
      .filter((c) => typeof c === 'object' && c !== null);
    const failedEvent = events.find((e: any) => e.event === 'email.failed');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.error).toBe('erro string');
  });

  // REQ-EM-10
  it('deve fazer no-op + warn para templateId com caracteres inválidos (path-traversal)', async () => {
    await service.send('../../etc/passwd', 'a@b.c', {});
    expect(emailService.send).not.toHaveBeenCalled();
    const events = warnSpy.mock.calls
      .flat()
      .filter((c) => typeof c === 'object' && c !== null)
      .map((c: any) => c.event);
    expect(events).toContain('email.invalid_template');
  });

  // REQ-EM-10
  it('deve fazer no-op + warn para templateId não em KNOWN_TEMPLATES', async () => {
    await service.send('template_inexistente', 'a@b.c', {});
    expect(emailService.send).not.toHaveBeenCalled();
    const events = warnSpy.mock.calls
      .flat()
      .filter((c) => typeof c === 'object' && c !== null)
      .map((c: any) => c.event);
    expect(events).toContain('email.invalid_template');
  });

  it('deve fazer no-op + warn quando template não está no cache do templateLoader', async () => {
    (templateLoader.get as jest.Mock).mockReturnValue(undefined);

    await service.send('auth.password_reset', 'a@b.c', {
      nome: 'X',
      link: 'L',
      validade: 'V',
    });

    expect(emailService.send).not.toHaveBeenCalled();
    const events = warnSpy.mock.calls
      .flat()
      .filter((c) => typeof c === 'object' && c !== null)
      .map((c: any) => c.event);
    expect(events).toContain('email.template_missing');
  });

  it('deve usar defaults quando APP_NAME e APP_LOGIN_URL não estão no config', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'EMAIL_NOTIFICATIONS_ENABLED') return 'true';
      // APP_NAME e APP_LOGIN_URL retornam undefined → cai nos defaults
      return undefined;
    });

    await service.send('auth.password_reset', 'a@b.c', {
      nome: 'X',
      link: 'L',
      validade: 'V',
    });

    const [message] = emailService.send.mock.calls[0];
    expect(message.body).toContain('API Padrão');
    expect(message.body).toContain('http://localhost:3000');
  });

  it('deve aceitar chamada sem variables (default {} via parâmetro opcional)', async () => {
    // Sem variables, default {} deve ser aplicado
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      const map: Record<string, string> = {
        APP_NAME: 'API Padrão',
        APP_LOGIN_URL: 'http://localhost:3000',
        EMAIL_NOTIFICATIONS_ENABLED: 'true',
      };
      return map[key];
    });

    // Template simples que não exige variáveis além das automáticas
    const simpleTemplate: EmailTemplate = {
      templateId: 'auth.password_reset',
      subject: 'Bem-vindo ao {{APP_NAME}}',
      body: '© {{ano_atual}}',
    };
    (templateLoader.get as jest.Mock).mockReturnValue(simpleTemplate);

    await service.send('auth.password_reset', 'a@b.c');

    expect(emailService.send).toHaveBeenCalledTimes(1);
  });

  it('deve fazer no-op quando EMAIL_NOTIFICATIONS_ENABLED=false', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'EMAIL_NOTIFICATIONS_ENABLED') return 'false';
      return 'API Padrão';
    });
    await service.send('auth.password_reset', 'a@b.c', {
      nome: 'X',
      link: 'L',
      validade: 'V',
    });
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('deve validar "to" como e-mail; inválido → no-op', async () => {
    await service.send('auth.password_reset', 'nao-eh-email', {
      nome: 'X',
      link: 'L',
      validade: 'V',
    });
    expect(emailService.send).not.toHaveBeenCalled();
    const events = warnSpy.mock.calls
      .flat()
      .filter((c) => typeof c === 'object' && c !== null)
      .map((c: any) => c.event);
    expect(events).toContain('email.invalid_recipient');
  });

  it('deve logar evento estruturado { event: "email.sent", template, to }', async () => {
    await service.send('auth.password_reset', 'a@b.c', {
      nome: 'X',
      link: 'L',
      validade: 'V',
    });
    const events = logSpy.mock.calls
      .flat()
      .filter((c) => typeof c === 'object' && c !== null)
      .map((c: any) => c.event);
    expect(events).toContain('email.sent');
  });

  // REQ-EM-N01
  it('deve completar em ≤ 50ms (mock)', async () => {
    const start = Date.now();
    await service.send('auth.password_reset', 'a@b.c', {
      nome: 'X',
      link: 'L',
      validade: 'V',
    });
    const duration = Date.now() - start;
    expect(duration).toBeLessThanOrEqual(50);
  });

  // REQ-EM-09
  it('render deve substituir {{var}} por valor de variables', () => {
    const result = (service as any).render('Olá {{nome}}!', { nome: 'João' });
    expect(result).toBe('Olá João!');
  });

  // REQ-EM-09 (Edge case 16)
  it('render deve filtrar valores undefined/vazios antes da substituição', () => {
    const result = (service as any).render('{{a}}-{{b}}-{{c}}', {
      a: '1',
      b: undefined,
      c: '3',
    });
    expect(result).toBe('1--3');
  });

  // REQ-EM-09 (Edge case - null)
  it('render deve tratar null como string vazia', () => {
    const result = (service as any).render('{{x}}', { x: null });
    expect(result).toBe('');
  });

  // REQ-EM-09 (Edge case - placeholder faltando)
  it('render deve lançar erro quando placeholder não está em vars', () => {
    expect(() => (service as any).render('{{a}}-{{b}}', { a: '1' })).toThrow(
      /Placeholder \{\{b\}\} não encontrado/,
    );
  });
});
