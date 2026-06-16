// BDD: features/autenticacao.feature:Funcionalidade: Recuperação de Senha
// SDD: .openspec/changes/password-recovery/design.md:REQ-PR-004
// TDD: cobertura do adapter mock (Logger Pino) para EmailService.
import { Logger } from '@nestjs/common';
import { LoggerEmailService } from './logger-email.service';

describe('LoggerEmailService', () => {
  let service: LoggerEmailService;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new LoggerEmailService();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('loga to, subject e body do email mock', async () => {
    await service.send({
      to: 'user@example.com',
      subject: 'Reset de senha',
      body: 'http://app/reset?token=abc',
    });

    expect(logSpy).toHaveBeenCalledTimes(3);
    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      '📧 [EMAIL MOCK] Para: user@example.com',
    );
    expect(logSpy).toHaveBeenNthCalledWith(2, 'Assunto: Reset de senha');
    expect(logSpy).toHaveBeenNthCalledWith(
      3,
      'Corpo: http://app/reset?token=abc',
    );
  });

  it('resolve sem lançar', async () => {
    await expect(
      service.send({ to: 'a@b.c', subject: 's', body: 'b' }),
    ).resolves.toBeUndefined();
  });
});
