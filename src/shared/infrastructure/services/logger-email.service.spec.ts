// BDD: features/email-notifications.feature:Cenário: LoggerEmailService NÃO loga body em NODE_ENV=production
// SDD: .openspec/changes/email-notifications/design.md:REQ-EM-N02
// ATDD: test/email-notifications.e2e-spec.ts:LoggerEmailService (adapter Pino) > AC-EM-11
// TDD: cobertura do adapter mock (Logger Pino) para EmailService.
import { Logger } from '@nestjs/common';
import { LoggerEmailService } from './logger-email.service';

describe('LoggerEmailService (REQ-EM-N02)', () => {
  let service: LoggerEmailService;
  let logSpy: jest.SpyInstance;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    service = new LoggerEmailService();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    logSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  // BDD: features/email-notifications.feature:Cenário: E-mail de recuperação de senha continua sendo enviado via template auth.password_reset
  it('deve logar to, subject e event=email.sent em development', async () => {
    process.env.NODE_ENV = 'development';
    await service.send({
      to: 'user@example.com',
      subject: 'Reset',
      body: 'secret body content',
    });

    const allCalls = logSpy.mock.calls.flat().map(String).join(' ');
    expect(allCalls).toContain('user@example.com');
    expect(allCalls).toContain('Reset');
    expect(allCalls).toContain('email.sent');
  });

  // BDD: features/email-notifications.feature:LoggerEmailService NÃO loga body em NODE_ENV=production
  it('NÃO deve logar body em production (apenas to + subject)', async () => {
    process.env.NODE_ENV = 'production';
    await service.send({
      to: 'user@example.com',
      subject: 'S',
      body: 'CORPO_SECRETO_TOKEN_RESET',
    });

    const allCalls = logSpy.mock.calls.flat().map(String).join(' ');
    expect(allCalls).not.toContain('CORPO_SECRETO_TOKEN_RESET');
    expect(allCalls).toContain('user@example.com');
    expect(allCalls).toContain('S');
  });

  it('deve aceitar EmailMessage com todos os campos e resolver sem lançar', async () => {
    process.env.NODE_ENV = 'test';
    await expect(
      service.send({ to: 'a@b.c', subject: 's', body: 'b' }),
    ).resolves.toBeUndefined();
  });

  it('deve aceitar EmailMessage com campos opcionais ausentes (apenas to + subject) sem crash', async () => {
    process.env.NODE_ENV = 'test';
    await expect(
      service.send({ to: 'a@b.c', subject: 's', body: '' }),
    ).resolves.toBeUndefined();
  });

  it('deve logar body em development para facilitar DX', async () => {
    process.env.NODE_ENV = 'development';
    await service.send({
      to: 'a@b.c',
      subject: 'S',
      body: 'VISIBLE_BODY_IN_DEV',
    });

    const allCalls = logSpy.mock.calls.flat().map(String).join(' ');
    expect(allCalls).toContain('VISIBLE_BODY_IN_DEV');
  });
});
