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
    expect(repository).toBeDefined();
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
  });
});
