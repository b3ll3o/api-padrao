import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPerfilRepository } from './prisma-perfil.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePerfilDto } from '../../dto/create-perfil.dto';
import { UpdatePerfilDto } from '../../dto/update-perfil.dto';

describe('PrismaPerfilRepository', () => {
  let repository: PrismaPerfilRepository;

  const mockPerfilModel = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaPerfilRepository,
        {
          provide: PrismaService,
          useValue: {
            perfil: mockPerfilModel,
            extended: {
              perfil: mockPerfilModel,
            },
          },
        },
      ],
    }).compile();

    repository = module.get<PrismaPerfilRepository>(PrismaPerfilRepository);
  });

  it('deve ser definido', () => {
    expect(repository).toBeInstanceOf(PrismaPerfilRepository);
  });

  const mockPerfil = {
    id: 1,
    nome: 'Admin',
    codigo: 'ADMIN',
    descricao: 'Administrador',
    deletedAt: null,
    ativo: true,
    empresaId: 'empresa-1',
    permissoes: [],
  };

  describe('create', () => {
    // REQ-PERFIL-001: persistir Perfil escopado por empresaId
    // REQ-PERFIL-005: connect permissoesIds
    it('deve criar um perfil com permissões', async () => {
      const createPerfilDto: CreatePerfilDto = {
        nome: 'Admin',
        codigo: 'ADMIN',
        descricao: 'Administrador',
        permissoesIds: [1, 2],
        empresaId: 'empresa-1',
      };

      mockPerfilModel.create.mockResolvedValue({
        ...mockPerfil,
        permissoes: [{ id: 1 }, { id: 2 }],
      });

      const result = await repository.create(createPerfilDto);

      expect(result.nome).toBe(createPerfilDto.nome);
      expect(mockPerfilModel.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('deve retornar uma lista de perfis e o total', async () => {
      mockPerfilModel.findMany.mockResolvedValue([mockPerfil]);
      mockPerfilModel.count.mockResolvedValue(1);

      const [result, total] = await repository.findAll(0, 10);

      expect(result).toHaveLength(1);
      expect(total).toBe(1);
    });

    // REQ-PERFIL-006: filtrar por empresaId
    it('deve filtrar por empresaId se fornecido', async () => {
      mockPerfilModel.findMany.mockResolvedValue([mockPerfil]);
      mockPerfilModel.count.mockResolvedValue(1);

      await repository.findAll(0, 10, false, 'empresa-1');

      expect(mockPerfilModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ empresaId: 'empresa-1' }),
        }),
      );
    });
  });

  describe('update', () => {
    it('deve atualizar um perfil com sucesso', async () => {
      const dto: UpdatePerfilDto = { nome: 'Novo Nome' };
      mockPerfilModel.findFirst.mockResolvedValue(mockPerfil);
      mockPerfilModel.update.mockResolvedValue({
        ...mockPerfil,
        nome: 'Novo Nome',
      });

      const result = await repository.update(1, dto);

      expect(result?.nome).toBe('Novo Nome');
      expect(mockPerfilModel.update).toHaveBeenCalled();
    });

    it('deve retornar undefined se o perfil não existir', async () => {
      mockPerfilModel.findFirst.mockResolvedValue(null);
      const result = await repository.update(99, {});
      expect(result).toBeUndefined();
    });
  });

  describe('remove', () => {
    // REQ-PERFIL-010: soft delete via client estendido (deletedAt=NOW, ativo=false)
    it('deve realizar soft delete chamando delete do client estendido', async () => {
      mockPerfilModel.delete.mockResolvedValue({
        ...mockPerfil,
        ativo: false,
        deletedAt: new Date(),
      });

      const result = await repository.remove(1);

      expect(result.ativo).toBe(false);
      expect(mockPerfilModel.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
        }),
      );
    });
  });

  describe('restore', () => {
    // REQ-PERFIL-010: restore (deletedAt=null, ativo=true)
    it('deve restaurar um perfil deletado', async () => {
      mockPerfilModel.update.mockResolvedValue(mockPerfil);

      const result = await repository.restore(1);

      expect(result.ativo).toBe(true);
      expect(result.deletedAt).toBeNull();
    });
  });

  describe('findByNome', () => {
    it('deve buscar por nome exato', async () => {
      mockPerfilModel.findFirst.mockResolvedValue(mockPerfil);

      const result = await repository.findByNome('Admin', false, 'empresa-1');

      expect(result?.nome).toBe('Admin');
      expect(mockPerfilModel.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            nome: 'Admin',
            empresaId: 'empresa-1',
          }),
        }),
      );
    });
  });

  describe('findByNomeContaining', () => {
    it('deve buscar por parte do nome', async () => {
      mockPerfilModel.findMany.mockResolvedValue([mockPerfil]);
      mockPerfilModel.count.mockResolvedValue(1);

      const [result, total] = await repository.findByNomeContaining(
        'Adm',
        0,
        10,
      );

      expect(result).toHaveLength(1);
      expect(total).toBe(1);
      expect(mockPerfilModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            nome: expect.objectContaining({ contains: 'Adm' }),
          }),
        }),
      );
    });

    it('filtra por empresaId quando fornecido', async () => {
      mockPerfilModel.findMany.mockResolvedValue([mockPerfil]);
      mockPerfilModel.count.mockResolvedValue(1);

      await repository.findByNomeContaining('Adm', 0, 10, false, 'empresa-1');
      expect(mockPerfilModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ empresaId: 'empresa-1' }),
        }),
      );
    });

    it('usa prisma direto (não extended) quando includeDeleted=true', async () => {
      mockPerfilModel.findMany.mockResolvedValue([mockPerfil]);
      mockPerfilModel.count.mockResolvedValue(1);
      await repository.findByNomeContaining('Adm', 0, 10, true);
      // Não podemos distinguir o client do mock, mas o caminho executa
      expect(mockPerfilModel.findMany).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('retorna o perfil mapeado para domínio', async () => {
      mockPerfilModel.findFirst.mockResolvedValue(mockPerfil);
      const result = await repository.findOne(1, false, 'empresa-1');
      expect(result?.id).toBe(1);
      expect(result?.permissoes).toEqual([]);
    });

    it('retorna undefined quando não encontrado', async () => {
      mockPerfilModel.findFirst.mockResolvedValue(null);
      const result = await repository.findOne(99);
      expect(result).toBeUndefined();
    });

    it('filtra por empresaId quando fornecido', async () => {
      mockPerfilModel.findFirst.mockResolvedValue(mockPerfil);
      await repository.findOne(1, false, 'empresa-1');
      expect(mockPerfilModel.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 1, empresaId: 'empresa-1' }),
        }),
      );
    });
  });

  describe('update (error paths)', () => {
    it('retorna undefined quando Prisma lança P2025 (registro não existe)', async () => {
      mockPerfilModel.findFirst.mockResolvedValue(mockPerfil);
      const p2025 = Object.assign(new Error('Not found'), { code: 'P2025' });
      mockPerfilModel.update.mockRejectedValue(p2025);

      const result = await repository.update(1, { nome: 'x' });
      expect(result).toBeUndefined();
    });

    it('relança outros erros (não-P2025)', async () => {
      mockPerfilModel.findFirst.mockResolvedValue(mockPerfil);
      const generic = new Error('boom');
      mockPerfilModel.update.mockRejectedValue(generic);

      await expect(repository.update(1, { nome: 'x' })).rejects.toThrow('boom');
    });
  });

  describe('remove (error paths)', () => {
    it('lança NotFoundException quando Prisma lança P2025', async () => {
      const p2025 = Object.assign(new Error('Not found'), { code: 'P2025' });
      mockPerfilModel.delete.mockRejectedValue(p2025);
      await expect(repository.remove(99)).rejects.toThrow(
        'Perfil com ID 99 não encontrado.',
      );
    });

    it('relança outros erros (não-P2025)', async () => {
      const generic = new Error('connection lost');
      mockPerfilModel.delete.mockRejectedValue(generic);
      await expect(repository.remove(1)).rejects.toThrow('connection lost');
    });
  });

  describe('restore (error paths)', () => {
    it('lança NotFoundException quando Prisma lança P2025', async () => {
      const p2025 = Object.assign(new Error('Not found'), { code: 'P2025' });
      mockPerfilModel.update.mockRejectedValue(p2025);
      await expect(repository.restore(99)).rejects.toThrow(
        'Perfil com ID 99 não encontrado.',
      );
    });

    it('filtra por empresaId no restore quando fornecido', async () => {
      mockPerfilModel.update.mockResolvedValue(mockPerfil);
      await repository.restore(1, 'empresa-1');
      expect(mockPerfilModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 1, empresaId: 'empresa-1' }),
        }),
      );
    });
  });

  describe('findByNome (branches)', () => {
    it('busca sem filtro de empresa', async () => {
      mockPerfilModel.findFirst.mockResolvedValue(mockPerfil);
      const result = await repository.findByNome('Admin', false);
      expect(result?.codigo).toBe('ADMIN');
    });

    it('retorna null quando não encontra', async () => {
      mockPerfilModel.findFirst.mockResolvedValue(null);
      const result = await repository.findByNome(
        'Inexistente',
        false,
        'empresa-1',
      );
      expect(result).toBeNull();
    });

    it('usa prisma direto quando includeDeleted=true', async () => {
      mockPerfilModel.findFirst.mockResolvedValue(mockPerfil);
      await repository.findByNome('Admin', true, 'empresa-1');
      expect(mockPerfilModel.findFirst).toHaveBeenCalled();
    });
  });

  describe('findAll (branches)', () => {
    it('usa prisma direto quando includeDeleted=true', async () => {
      mockPerfilModel.findMany.mockResolvedValue([mockPerfil]);
      mockPerfilModel.count.mockResolvedValue(1);
      const [result, total] = await repository.findAll(0, 10, true);
      expect(result).toHaveLength(1);
      expect(total).toBe(1);
    });

    it('filtra por empresaId quando fornecido', async () => {
      mockPerfilModel.findMany.mockResolvedValue([mockPerfil]);
      mockPerfilModel.count.mockResolvedValue(1);
      await repository.findAll(0, 10, false, 'empresa-1');
      expect(mockPerfilModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ empresaId: 'empresa-1' }),
        }),
      );
    });
  });

  describe('create (branches)', () => {
    // REQ-PERFIL-004: criar sem permissoesIds (connect=undefined)
    it('cria sem permissoesIds quando não fornecido', async () => {
      mockPerfilModel.create.mockResolvedValue(mockPerfil);
      const dto: CreatePerfilDto = {
        nome: 'Simples',
        codigo: 'SIMPLES',
        descricao: 'Sem permissões',
        empresaId: 'empresa-1',
      };
      await repository.create(dto);
      // Quando permissoesIds é undefined, o connect fica undefined
      expect(mockPerfilModel.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            permissoes: { connect: undefined },
          }),
        }),
      );
    });
  });
});
