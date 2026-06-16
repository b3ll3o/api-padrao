import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { Usuario } from '../../domain/entities/usuario.entity';
import { UpdateUsuarioDto } from '../../dto/update-usuario.dto';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { IUsuarioAuthorizationService } from './usuario-authorization.service';
import { EmpresaRepository } from '../../../empresas/domain/repositories/empresa.repository';

describe('UsuariosService', () => {
  let service: UsuariosService;
  let mockUsuarioRepository: {
    create: jest.Mock;
    findByEmail: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    restore: jest.Mock;
    findAll: jest.Mock;
  };
  let mockPasswordHasher: {
    hash: jest.Mock;
    compare: jest.Mock;
  };
  let mockUsuarioAuthorizationService: {
    canAccessUsuario: jest.Mock;
    canUpdateUsuario: jest.Mock;
    canDeleteUsuario: jest.Mock;
    canRestoreUsuario: jest.Mock;
  };
  let mockEmpresaRepository: {
    findCompaniesByUser: jest.Mock;
  };

  beforeEach(async () => {
    mockUsuarioRepository = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockImplementation((id, data) => {
        const updatedUser = new Usuario();
        Object.assign(updatedUser, { id, ...data });
        return updatedUser;
      }),
      remove: jest.fn(),
      restore: jest.fn(),
      findAll: jest.fn(),
    };
    mockPasswordHasher = {
      hash: jest.fn().mockResolvedValue('hashedPassword'),
      compare: jest.fn().mockResolvedValue(true),
    };
    mockUsuarioAuthorizationService = {
      canAccessUsuario: jest.fn().mockReturnValue(true),
      canUpdateUsuario: jest.fn().mockReturnValue(true),
      canDeleteUsuario: jest.fn().mockReturnValue(true),
      canRestoreUsuario: jest.fn().mockReturnValue(true),
    };
    mockEmpresaRepository = {
      findCompaniesByUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        {
          provide: UsuarioRepository,
          useValue: mockUsuarioRepository,
        },
        {
          provide: PasswordHasher,
          useValue: mockPasswordHasher,
        },
        {
          provide: IUsuarioAuthorizationService,
          useValue: mockUsuarioAuthorizationService,
        },
        {
          provide: EmpresaRepository,
          useValue: mockEmpresaRepository,
        },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('criação', () => {
    it('deve criar um usuário com senha hasheada', async () => {
      const createDto: CreateUsuarioDto = {
        email: 'test@example.com',
        senha: 'Password123!',
      };
      const createdUser = new Usuario();
      createdUser.id = 1;
      createdUser.email = createDto.email;
      createdUser.deletedAt = null;

      mockUsuarioRepository.findByEmail.mockResolvedValue(null);
      mockUsuarioRepository.create.mockResolvedValue(createdUser);

      const result = await service.create(createDto);

      expect(result).toEqual(createdUser);
      expect(mockPasswordHasher.hash).toHaveBeenCalledWith('Password123!');
    });

    it('deve criar um usuário sem senha (undefined)', async () => {
      const createDto: CreateUsuarioDto = { email: 'nosecret@example.com' };
      const createdUser = new Usuario();
      createdUser.id = 2;
      createdUser.email = createDto.email;

      mockUsuarioRepository.findByEmail.mockResolvedValue(null);
      mockUsuarioRepository.create.mockResolvedValue(createdUser);

      await service.create(createDto);
      expect(mockPasswordHasher.hash).not.toHaveBeenCalled();
    });

    it('lança ConflictException se email já existe', async () => {
      mockUsuarioRepository.findByEmail.mockResolvedValue({ id: 99 });
      await expect(
        service.create({ email: 'dup@example.com', senha: 'x' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'admin@example.com',
      empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'ADMIN' }] }],
    };

    it('deve listar usuários para um administrador', async () => {
      mockUsuarioRepository.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      const result = await service.findAll(
        { page: 1, limit: 10 },
        mockAdminUsuarioLogado,
        false,
        'empresa-1',
      );

      expect(result.data).toBeInstanceOf(Array);
      expect(mockUsuarioRepository.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10 },
        false,
      );
    });

    it('aceita admin global mesmo sem empresaId no parâmetro', async () => {
      mockUsuarioRepository.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });
      const result = await service.findAll(
        { page: 1, limit: 10 },
        mockAdminUsuarioLogado,
        false,
      );
      expect(result.data).toBeInstanceOf(Array);
    });

    it('deve lançar ForbiddenException para não-administradores', async () => {
      const mockUsuarioLogado: JwtPayload = {
        userId: 1,
        email: 'test@example.com',
        empresas: [],
      };
      await expect(
        service.findAll({ page: 1, limit: 10 }, mockUsuarioLogado),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('busca por um', () => {
    const mockUser = new Usuario();
    mockUser.id = 1;
    mockUser.email = 'test@example.com';
    mockUser.deletedAt = null;

    const mockUsuarioLogado: JwtPayload = {
      userId: 1,
      email: 'test@example.com',
      empresas: [],
    };

    it('deve retornar um usuário se encontrado e permitido', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne(1, mockUsuarioLogado);

      expect(result).toEqual(mockUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, false);
    });

    it('lança NotFoundException quando o usuário não existe', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne(99, mockUsuarioLogado)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lança ForbiddenException quando canAccessUsuario=false', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);
      mockUsuarioAuthorizationService.canAccessUsuario.mockReturnValue(false);
      await expect(service.findOne(1, mockUsuarioLogado)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('atualização', () => {
    const mockUser = new Usuario();
    mockUser.id = 1;
    mockUser.email = 'test@example.com';
    mockUser.deletedAt = null;

    const mockAdminUsuarioLogado: JwtPayload = {
      userId: 2,
      email: 'admin@example.com',
      empresas: [{ id: 'empresa-1', perfis: [{ codigo: 'ADMIN' }] }],
    };

    it('deve atualizar um usuário se encontrado e permitido', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'updated@example.com' };
      const updatedUser = { ...mockUser, email: 'updated@example.com' };

      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);
      mockUsuarioRepository.findByEmail.mockResolvedValue(null);
      mockUsuarioRepository.update.mockResolvedValue(updatedUser);

      const result = await service.update(1, updateDto, mockAdminUsuarioLogado);

      expect(result).toEqual(updatedUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, true);
    });

    it('lança NotFoundException quando o usuário não existe', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(null);
      await expect(
        service.update(99, { email: 'x' }, mockAdminUsuarioLogado, 'empresa-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('hasheia a senha quando enviada', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);
      mockUsuarioRepository.update.mockImplementation((id, data) => {
        const u = new Usuario();
        Object.assign(u, { id, ...data });
        return u;
      });

      await service.update(
        1,
        { senha: 'NewP@ss1' },
        mockAdminUsuarioLogado,
        'empresa-1',
      );
      expect(mockPasswordHasher.hash).toHaveBeenCalledWith('NewP@ss1');
    });

    it('lança ConflictException se o novo email pertence a outro usuário', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);
      mockUsuarioRepository.findByEmail.mockResolvedValue({ id: 999 });

      await expect(
        service.update(
          1,
          { email: 'taken@example.com' },
          mockAdminUsuarioLogado,
          'empresa-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('lança ForbiddenException quando canUpdateUsuario=false', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);
      mockUsuarioAuthorizationService.canUpdateUsuario.mockReturnValue(false);
      await expect(
        service.update(
          1,
          { email: 'a@b.c' },
          mockAdminUsuarioLogado,
          'empresa-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    describe('soft delete / restore', () => {
      it('restaura usuário deletado quando ativo=true', async () => {
        const deletedUser = {
          ...mockUser,
          deletedAt: new Date(),
          ativo: false,
        };
        const restored = { ...mockUser, deletedAt: null, ativo: true };
        mockUsuarioRepository.findOne.mockResolvedValue(deletedUser);
        mockUsuarioRepository.restore.mockResolvedValue(restored);
        mockUsuarioRepository.update.mockResolvedValue(restored);

        const result = await service.update(
          1,
          { ativo: true },
          mockAdminUsuarioLogado,
          'empresa-1',
        );
        expect(result.deletedAt).toBeNull();
        expect(mockUsuarioRepository.restore).toHaveBeenCalledWith(1);
      });

      it('lança ConflictException ao tentar restaurar usuário não-deletado', async () => {
        mockUsuarioRepository.findOne.mockResolvedValue({
          ...mockUser,
          deletedAt: null,
        });
        await expect(
          service.update(
            1,
            { ativo: true },
            mockAdminUsuarioLogado,
            'empresa-1',
          ),
        ).rejects.toThrow(ConflictException);
      });

      it('lança ForbiddenException ao restaurar sem permissão', async () => {
        mockUsuarioRepository.findOne.mockResolvedValue({
          ...mockUser,
          deletedAt: new Date(),
        });
        mockUsuarioAuthorizationService.canRestoreUsuario.mockReturnValue(
          false,
        );
        await expect(
          service.update(
            1,
            { ativo: true },
            mockAdminUsuarioLogado,
            'empresa-1',
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('lança ConflictException ao tentar soft-deletar usuário já deletado', async () => {
        mockUsuarioRepository.findOne.mockResolvedValue({
          ...mockUser,
          deletedAt: new Date(),
        });
        await expect(
          service.update(
            1,
            { ativo: false },
            mockAdminUsuarioLogado,
            'empresa-1',
          ),
        ).rejects.toThrow(ConflictException);
      });

      it('lança ForbiddenException ao deletar sem ser admin na empresa', async () => {
        mockUsuarioRepository.findOne.mockResolvedValue({
          ...mockUser,
          deletedAt: null,
        });
        const nonAdminLogado: JwtPayload = {
          userId: 2,
          email: 'x@x',
          empresas: [{ id: 'outra', perfis: [{ codigo: 'GESTOR' }] }],
        };
        await expect(
          service.update(1, { ativo: false }, nonAdminLogado, 'empresa-1'),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    it('deve realizar soft delete de um usuário via flag ativo', async () => {
      const nonDeletedUser = { ...mockUser, deletedAt: null };
      const updateDto: UpdateUsuarioDto = { ativo: false };

      mockUsuarioRepository.findOne.mockResolvedValue(nonDeletedUser);
      mockUsuarioRepository.remove.mockResolvedValue({
        ...nonDeletedUser,
        deletedAt: new Date(),
      });

      const result = await service.update(
        1,
        updateDto,
        mockAdminUsuarioLogado,
        'empresa-1',
      );

      expect(result.deletedAt).not.toBeNull();
      expect(mockUsuarioRepository.remove).toHaveBeenCalledWith(1);
    });
  });
});
