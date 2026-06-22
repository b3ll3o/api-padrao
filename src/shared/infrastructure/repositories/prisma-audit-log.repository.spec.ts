// BDD: features/observabilidade.feature:Cenário: Logs de auditoria acessíveis via cursor
// SDD: .openspec/changes/observabilidade/design.md:REQ-AUDIT-READ-001
// TDD: cobertura completa do adapter Prisma para AuditLog com cursor.
import { PrismaAuditLogRepository } from './prisma-audit-log.repository';

describe('PrismaAuditLogRepository (cursor pagination)', () => {
  let repo: PrismaAuditLogRepository;
  let prisma: {
    auditLog: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    repo = new PrismaAuditLogRepository(prisma as any);
  });

  function makeRow(overrides: Partial<any> = {}) {
    return {
      id: overrides.id ?? `audit-${Math.random().toString(36).slice(2, 9)}`,
      usuarioId: overrides.usuarioId ?? null,
      acao: overrides.acao ?? 'usuario.create',
      recurso: overrides.recurso ?? 'usuario:1',
      recursoId: overrides.recursoId ?? '1',
      detalhes: overrides.detalhes ?? { method: 'POST' },
      ip: overrides.ip ?? '127.0.0.1',
      userAgent: overrides.userAgent ?? 'jest',
      createdAt: overrides.createdAt ?? new Date('2026-06-22T12:00:00Z'),
    };
  }

  describe('construção da query', () => {
    it('faz findMany com orderBy createdAt desc e take limit+1', async () => {
      await repo.findMany({ limit: 25 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          take: 26,
          where: {},
        }),
      );
    });

    it('usa limit default 50 quando não informado', async () => {
      await repo.findMany();
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 51 }),
      );
    });

    it('filtra por usuarioId quando fornecido', async () => {
      await repo.findMany({ usuarioId: 42 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { usuarioId: 42 } }),
      );
    });

    it('filtra por acao quando fornecido', async () => {
      await repo.findMany({ acao: 'usuario.create' });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { acao: 'usuario.create' },
        }),
      );
    });

    it('filtra por recurso quando fornecido', async () => {
      await repo.findMany({ recurso: 'usuario:42' });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { recurso: 'usuario:42' },
        }),
      );
    });

    it('combina filtros (acao + usuarioId + recurso)', async () => {
      await repo.findMany({
        acao: 'usuario.update',
        usuarioId: 1,
        recurso: 'usuario:1',
      });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            acao: 'usuario.update',
            usuarioId: 1,
            recurso: 'usuario:1',
          },
        }),
      );
    });

    it('aplica cursor (lt createdAt) quando fornecido', async () => {
      const cursor = '2026-06-22T12:00:00.000Z';
      await repo.findMany({ cursor });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { createdAt: { lt: new Date(cursor) } },
        }),
      );
    });

    it('combina cursor + filtros sem perder nenhum', async () => {
      await repo.findMany({
        cursor: '2026-06-22T11:00:00.000Z',
        acao: 'login',
        usuarioId: 7,
      });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            acao: 'login',
            usuarioId: 7,
            createdAt: { lt: new Date('2026-06-22T11:00:00.000Z') },
          },
        }),
      );
    });
  });

  describe('limites (DOS protection)', () => {
    it('clampa limit ao máximo (200)', async () => {
      await repo.findMany({ limit: 999_999 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 201 }),
      );
    });

    it('clampa limit abaixo de 1 para 1', async () => {
      await repo.findMany({ limit: 0 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2 }),
      );
    });

    it('clampa limit negativo para 1', async () => {
      await repo.findMany({ limit: -5 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2 }),
      );
    });
  });

  describe('detecção de próxima página (take+1)', () => {
    it('retorna nextCursor=null quando retornou menos que limit+1 (fim)', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        makeRow({ createdAt: new Date('2026-06-22T13:00:00Z') }),
        makeRow({ createdAt: new Date('2026-06-22T12:30:00Z') }),
      ]);
      const result = await repo.findMany({ limit: 50 });
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('retorna nextCursor quando há mais páginas (limit+1 itens)', async () => {
      const rows = [
        makeRow({ createdAt: new Date('2026-06-22T13:00:00Z') }),
        makeRow({ createdAt: new Date('2026-06-22T12:30:00Z') }),
        makeRow({ createdAt: new Date('2026-06-22T12:00:00Z') }), // +1 sentinel
      ];
      prisma.auditLog.findMany.mockResolvedValue(rows);
      const result = await repo.findMany({ limit: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.items[0].createdAt.toISOString()).toBe(
        '2026-06-22T13:00:00.000Z',
      );
      // nextCursor = timestamp do ÚLTIMO item DEVOLVIDO (sem o sentinel)
      expect(result.nextCursor).toBe('2026-06-22T12:30:00.000Z');
    });

    it('descarta o item sentinel antes de devolver', async () => {
      const sentinel = makeRow({
        id: 'sentinel',
        createdAt: new Date('2026-06-22T11:00:00Z'),
      });
      prisma.auditLog.findMany.mockResolvedValue([
        makeRow({ id: 'a', createdAt: new Date('2026-06-22T13:00:00Z') }),
        makeRow({ id: 'b', createdAt: new Date('2026-06-22T12:00:00Z') }),
        sentinel,
      ]);
      const result = await repo.findMany({ limit: 2 });
      expect(result.items.map((i) => i.id)).toEqual(['a', 'b']);
      expect(result.items.find((i) => i.id === 'sentinel')).toBeUndefined();
    });

    it('devolve array vazio e nextCursor=null quando banco vazio', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      const result = await repo.findMany({ limit: 50 });
      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    it('nextCursor=null quando itens == limit exatamente (boundary case)', async () => {
      // Cenário ambíguo: se take=limit+1 retornou exatamente limit+1
      // mas existe UM item a mais no banco, findMany já traria limit+1.
      // Já se retornou exatamente limit, significa que não há mais.
      // Aqui mockamos só `limit` (não limit+1), então não há mais.
      prisma.auditLog.findMany.mockResolvedValue([
        makeRow({ createdAt: new Date('2026-06-22T13:00:00Z') }),
        makeRow({ createdAt: new Date('2026-06-22T12:00:00Z') }),
      ]);
      const result = await repo.findMany({ limit: 2 });
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('shape do item devolvido', () => {
    it('preserva todos os campos do row do Prisma', async () => {
      const original = makeRow({
        id: 'audit-xyz',
        usuarioId: 9,
        acao: 'login',
        recurso: 'auth',
        recursoId: 'r-1',
        detalhes: { cpf: '********' },
        ip: '10.0.0.1',
        userAgent: 'Mozilla',
        createdAt: new Date('2026-06-22T10:00:00Z'),
      });
      prisma.auditLog.findMany.mockResolvedValue([original]);
      const result = await repo.findMany({ limit: 50 });
      expect(result.items[0]).toEqual({
        id: 'audit-xyz',
        usuarioId: 9,
        acao: 'login',
        recurso: 'auth',
        recursoId: 'r-1',
        detalhes: { cpf: '********' },
        ip: '10.0.0.1',
        userAgent: 'Mozilla',
        createdAt: new Date('2026-06-22T10:00:00Z'),
      });
    });
  });
});
