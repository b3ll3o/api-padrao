import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PasswordRecoveryService } from './password-recovery.service';
import { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { UsuarioRepository } from 'src/usuarios/domain/repositories/usuario.repository';
import { UnitOfWork } from '../../domain/services/unit-of-work.service';
import {
  EMAIL_SENDER_SERVICE,
  EmailSenderService,
} from '../../../shared/application/services/email-sender.service';

describe('PasswordRecoveryService', () => {
  let service: PasswordRecoveryService;

  const mockUsuarioRepository = {
    findByEmail: jest.fn(),
    findOne: jest.fn(),
  };

  const mockResetTokenRepository = {
    create: jest.fn(),
    findValidByHash: jest.fn(),
    markAsUsed: jest.fn(),
    invalidateAllForUser: jest.fn(),
  };

  const mockPasswordHasher = {
    hash: jest.fn(),
    compare: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'FRONTEND_URL') return 'http://localhost:3000';
      if (key === 'APP_NAME') return 'API Padrão';
      if (key === 'APP_LOGIN_URL') return 'http://localhost:3000';
      return null;
    }),
  };

  // [ALT-002] Mock do UnitOfWork em vez de PrismaService.
  // O service não conhece `prisma.$transaction` diretamente — apenas
  // invoca `unitOfWork.execute(work)` passando uma função que recebe
  // um "tx" (Prisma.TransactionClient). Aqui executamos o work com um
  // stub para que o service não quebre.
  const mockUnitOfWork = {
    execute: jest.fn(async <T, R>(work: (tx: T) => Promise<R>) => {
      const stubTx = {
        usuario: { update: jest.fn().mockResolvedValue({}) },
        refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        passwordResetToken: { update: jest.fn().mockResolvedValue({}) },
      };
      return work(stubTx as unknown as T);
    }),
  };

  const mockEmailSender: jest.Mocked<EmailSenderService> = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordRecoveryService,
        { provide: UsuarioRepository, useValue: mockUsuarioRepository },
        {
          // [Cleanup Sprint 2] Injeta a porta PasswordResetTokenRepository
          // (DIP) — não mais o adapter concreto PrismaPasswordResetTokenRepository.
          provide: PasswordResetTokenRepository,
          useValue: mockResetTokenRepository,
        },
        { provide: PasswordHasher, useValue: mockPasswordHasher },
        { provide: UnitOfWork, useValue: mockUnitOfWork },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EMAIL_SENDER_SERVICE, useValue: mockEmailSender },
      ],
    }).compile();

    service = module.get<PasswordRecoveryService>(PasswordRecoveryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockEmailSender.send.mockResolvedValue(undefined);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('forgotPassword', () => {
    // BDD: features/autenticacao.feature:Cenário: Solicitar recuperação de senha com e-mail válido
    it('deve gerar token de reset e enviar e-mail quando usuário existe e está ativo', async () => {
      const user = {
        id: 1,
        email: 'usuario@empresa.com',
        ativo: true,
      };
      mockUsuarioRepository.findByEmail.mockResolvedValue(user);
      mockResetTokenRepository.invalidateAllForUser.mockResolvedValue(
        undefined,
      );
      mockResetTokenRepository.create.mockResolvedValue({});
      mockEmailSender.send.mockResolvedValue();

      await service.forgotPassword({ email: 'usuario@empresa.com' });

      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        'usuario@empresa.com',
      );
      expect(
        mockResetTokenRepository.invalidateAllForUser,
      ).toHaveBeenCalledWith(1);
      expect(mockResetTokenRepository.create).toHaveBeenCalledTimes(1);
      const createdArg = mockResetTokenRepository.create.mock.calls[0][0];
      expect(createdArg.userId).toBe(1);
      expect(createdArg.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(createdArg.expiresAt).toBeInstanceOf(Date);
      expect(createdArg.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // [email-notifications] Verifica que o orquestrador foi chamado com o template correto
      expect(mockEmailSender.send).toHaveBeenCalledTimes(1);
      const sentArgs = mockEmailSender.send.mock.calls[0];
      expect(sentArgs[0]).toBe('auth.password_reset');
      expect(sentArgs[1]).toBe('usuario@empresa.com');
      expect(sentArgs[2]).toHaveProperty('link');
      expect(sentArgs[2]).toHaveProperty('validade');
    });

    // BDD: features/autenticacao.feature:Cenário: Solicitar recuperação de senha com e-mail inexistente
    it('deve retornar silenciosamente quando usuário não existe', async () => {
      mockUsuarioRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ email: 'naoexiste@empresa.com' }),
      ).resolves.toBeUndefined();

      expect(
        mockResetTokenRepository.invalidateAllForUser,
      ).not.toHaveBeenCalled();
      expect(mockResetTokenRepository.create).not.toHaveBeenCalled();
      expect(mockEmailSender.send).not.toHaveBeenCalled();
    });

    it('deve retornar silenciosamente quando usuário está desativado', async () => {
      const user = { id: 1, email: 'inativo@empresa.com', ativo: false };
      mockUsuarioRepository.findByEmail.mockResolvedValue(user);

      await expect(
        service.forgotPassword({ email: 'inativo@empresa.com' }),
      ).resolves.toBeUndefined();

      expect(
        mockResetTokenRepository.invalidateAllForUser,
      ).not.toHaveBeenCalled();
      expect(mockResetTokenRepository.create).not.toHaveBeenCalled();
      expect(mockEmailSender.send).not.toHaveBeenCalled();
    });

    // BDD: features/autenticacao.feature:REQ-PR-005
    it('deve invalidar tokens anteriores antes de criar novo', async () => {
      const user = { id: 1, email: 'usuario@empresa.com', ativo: true };
      mockUsuarioRepository.findByEmail.mockResolvedValue(user);
      mockResetTokenRepository.invalidateAllForUser.mockResolvedValue(
        undefined,
      );
      mockResetTokenRepository.create.mockResolvedValue({});
      mockEmailSender.send.mockResolvedValue();

      await service.forgotPassword({ email: 'usuario@empresa.com' });

      const invalidateOrder =
        mockResetTokenRepository.invalidateAllForUser.mock
          .invocationCallOrder[0];
      const createOrder =
        mockResetTokenRepository.create.mock.invocationCallOrder[0];
      expect(invalidateOrder).toBeLessThan(createOrder);
    });
  });

  describe('resetPassword', () => {
    it('deve lançar UnauthorizedException quando token não encontrado', async () => {
      mockResetTokenRepository.findValidByHash.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'qualquer-token',
          novaSenha: 'NovaSenha123!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPasswordHasher.hash).not.toHaveBeenCalled();
      expect(mockUnitOfWork.execute).not.toHaveBeenCalled();
    });

    // BDD: features/autenticacao.feature:Cenário: Resetar senha com token válido
    it('deve atualizar senha e marcar token como usado em transação', async () => {
      const tokenRecord = {
        id: 'token-id',
        userId: 1,
        tokenHash: createHash('sha256').update('plain-token').digest('hex'),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        usedAt: null,
        createdAt: new Date(),
      };
      mockResetTokenRepository.findValidByHash.mockResolvedValue(tokenRecord);
      mockPasswordHasher.hash.mockResolvedValue('new-hash');
      // [email-notifications] Mock do usuarioRepository.findOne para o e-mail password_changed
      mockUsuarioRepository.findOne.mockResolvedValue({
        id: 1,
        email: 'usuario@empresa.com',
        nome: 'João',
        deletedAt: null,
        ativo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.resetPassword({
          token: 'plain-token',
          novaSenha: 'NovaSenha123!',
        }),
      ).resolves.toBeUndefined();

      expect(mockPasswordHasher.hash).toHaveBeenCalledWith('NovaSenha123!');

      // findValidByHash deve receber o HASH do token plain, nunca o plain
      const calledWith =
        mockResetTokenRepository.findValidByHash.mock.calls[0][0];
      expect(calledWith).toBe(tokenRecord.tokenHash);
      expect(calledWith).not.toBe('plain-token');

      // [ALT-002] A transação é executada via UnitOfWork (não PrismaService direto).
      expect(mockUnitOfWork.execute).toHaveBeenCalledTimes(1);
      // O callback passado ao UnitOfWork deve chamar 3 operações no `tx`:
      // tx.usuario.update, tx.refreshToken.updateMany, tx.passwordResetToken.update.
      const workCallback = mockUnitOfWork.execute.mock.calls[0][0];
      const stubTx = {
        usuario: { update: jest.fn().mockResolvedValue({}) },
        refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        passwordResetToken: { update: jest.fn().mockResolvedValue({}) },
      };
      await workCallback(stubTx);
      expect(stubTx.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { senha: 'new-hash' },
      });
      expect(stubTx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(stubTx.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'token-id' },
        data: { usedAt: expect.any(Date) },
      });

      // [email-notifications] Após reset bem-sucedido, dispara e-mail password_changed
      expect(mockEmailSender.send).toHaveBeenCalledWith(
        'usuarios.password_changed',
        'usuario@empresa.com',
        expect.objectContaining({ nome: expect.any(String) }),
      );
    });
  });
});
