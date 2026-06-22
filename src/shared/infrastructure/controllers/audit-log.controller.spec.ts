// BDD: features/observabilidade.feature:Cenário: Logs de auditoria acessíveis via cursor
// SDD: .openspec/changes/observabilidade/design.md:REQ-AUDIT-READ-001
// TDD: cobertura completa do AuditLogController (cursor, filtros, validação).
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogController } from './audit-log.controller';
import { PrismaAuditLogRepository } from '../repositories/prisma-audit-log.repository';

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let repo: {
    findMany: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findMany: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [
        {
          provide: PrismaAuditLogRepository,
          useValue: repo,
        },
      ],
    }).compile();
    controller = module.get<AuditLogController>(AuditLogController);
  });

  it('deve ser definido', () => {
    expect(controller).toBeInstanceOf(AuditLogController);
  });

  describe('delegação ao repository', () => {
    it('passa os parâmetros crus para o repository quando válidos', async () => {
      await controller.list(
        '2026-06-22T12:00:00.000Z',
        '25',
        'usuario.create',
        '42',
        'usuario:42',
      );
      expect(repo.findMany).toHaveBeenCalledWith({
        cursor: '2026-06-22T12:00:00.000Z',
        limit: 25,
        acao: 'usuario.create',
        usuarioId: 42,
        recurso: 'usuario:42',
      });
    });

    it('omite limit quando string vazia', async () => {
      await controller.list(undefined, '');
      expect(repo.findMany).toHaveBeenCalledWith({
        cursor: undefined,
        limit: undefined,
        acao: undefined,
        usuarioId: undefined,
        recurso: undefined,
      });
    });

    it('omite usuarioId quando string vazia', async () => {
      await controller.list(undefined, undefined, undefined, '');
      expect(repo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ usuarioId: undefined }),
      );
    });

    it('devolve o objeto {items, nextCursor} do repository', async () => {
      repo.findMany.mockResolvedValue({
        items: [{ id: 'a' }],
        nextCursor: '2026-06-22T11:00:00.000Z',
      });
      const result = await controller.list();
      expect(result).toEqual({
        items: [{ id: 'a' }],
        nextCursor: '2026-06-22T11:00:00.000Z',
      });
    });
  });

  describe('validação de entrada', () => {
    it('rejeita cursor inválido (não ISO-8601)', async () => {
      await expect(controller.list('ontem')).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.findMany).not.toHaveBeenCalled();
    });

    it('rejeita cursor vazio/garbage que não parseia como Date', async () => {
      await expect(controller.list('xxxx-yyyy-zzzz')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('aceita cursor ISO-8601 sem timezone', async () => {
      await controller.list('2026-06-22T12:00:00');
      expect(repo.findMany).toHaveBeenCalled();
    });

    it('aceita cursor ISO-8601 com timezone Z', async () => {
      await controller.list('2026-06-22T12:00:00.000Z');
      expect(repo.findMany).toHaveBeenCalled();
    });

    it('rejeita limit não-inteiro', async () => {
      await expect(controller.list(undefined, '1.5')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejeita limit <= 0', async () => {
      await expect(controller.list(undefined, '0')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejeita limit NaN', async () => {
      await expect(controller.list(undefined, 'abc')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejeita usuarioId não-inteiro', async () => {
      await expect(
        controller.list(undefined, undefined, undefined, 'abc'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita usuarioId <= 0', async () => {
      await expect(
        controller.list(undefined, undefined, undefined, '0'),
      ).rejects.toThrow(BadRequestException);
    });

    it('não chama o repository se alguma validação falhar', async () => {
      await expect(controller.list('invalid')).rejects.toThrow();
      expect(repo.findMany).not.toHaveBeenCalled();
    });
  });

  describe('defaults e omissão', () => {
    it('funciona sem parâmetros (primeira página)', async () => {
      await controller.list();
      expect(repo.findMany).toHaveBeenCalledWith({
        cursor: undefined,
        limit: undefined,
        acao: undefined,
        usuarioId: undefined,
        recurso: undefined,
      });
    });
  });
});
