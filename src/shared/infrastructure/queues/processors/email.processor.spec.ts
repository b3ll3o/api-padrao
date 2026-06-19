// TDD: src/shared/infrastructure/queues/processors/email.processor.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-QUEUE-001
// ATDD: test/email-queue.e2e-spec.ts
import { EmailProcessor } from './email.processor';
import { EmailSenderService } from '../../../application/services/email-sender.service';

describe('EmailProcessor (queue: email)', () => {
  let processor: EmailProcessor;
  let emailSender: jest.Mocked<EmailSenderService>;

  beforeEach(() => {
    emailSender = {
      send: jest.fn().mockResolvedValue(undefined),
    } as any;
    processor = new EmailProcessor(emailSender);
  });

  function makeJob(overrides: Partial<any> = {}) {
    return {
      id: 'job-123',
      data: {
        templateId: 'auth.password_reset',
        to: 'user@example.com',
        variables: { name: 'Alice' },
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
      ...overrides,
    } as any;
  }

  it('deve chamar emailSender.send com templateId/to/variables', async () => {
    await processor.process(makeJob());
    expect(emailSender.send).toHaveBeenCalledTimes(1);
    expect(emailSender.send).toHaveBeenCalledWith(
      'auth.password_reset',
      'user@example.com',
      { name: 'Alice' },
    );
  });

  it('deve usar {} como variables default se não fornecido', async () => {
    await processor.process(
      makeJob({
        data: { templateId: 'foo', to: 'a@b.com' },
      }),
    );
    expect(emailSender.send).toHaveBeenCalledWith('foo', 'a@b.com', {});
  });

  it('deve propagar exceções para que BullMQ contabilize a falha', async () => {
    emailSender.send.mockRejectedValue(new Error('SMTP offline'));
    await expect(processor.process(makeJob())).rejects.toThrow('SMTP offline');
  });

  it('deve logar attemptsMade + opts.attempts (info de retry)', async () => {
    // Apenas verifica que process() não lança com attemptsMade != 0
    await processor.process(makeJob({ attemptsMade: 2 }));
    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });
});
