import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosService } from './usuarios.service';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import * as bcrypt from 'bcrypt';
// import { Usuario } from '../../domain/entities/usuario.entity'; // Removed unused import

// Mock the entire bcrypt module
jest.mock('bcrypt', () => ({
  genSalt: jest.fn(),
  hash: jest.fn(),
}));

describe('UsuariosService', () => {
  let service: UsuariosService;

  const mockUsuarioRepository = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Reset mock implementations for bcrypt functions
    (bcrypt.genSalt as jest.Mock).mockResolvedValue('mockSalt');
    (bcrypt.hash as jest.Mock).mockResolvedValue('mockHashedPassword');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        {
          provide: UsuarioRepository,
          useValue: mockUsuarioRepository,
        },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  // No need for afterEach(jest.restoreAllMocks) with jest.mock approach

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a user successfully with password and profiles', async () => {
      const createUsuarioDto: CreateUsuarioDto = {
        email: 'test@example.com',
        senha: 'password123',
        perfisIds: [1, 2],
      };

      mockUsuarioRepository.findByEmail.mockResolvedValue(null);
      mockUsuarioRepository.create.mockResolvedValue({
        id: 1,
        email: createUsuarioDto.email,
        createdAt: new Date(),
        updatedAt: new Date(),
        perfis: [{ id: 1 }, { id: 2 }],
      });

      const result = await service.create(createUsuarioDto);

      expect(result).toBeDefined();
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        createUsuarioDto.email,
      );
      expect(bcrypt.genSalt).toHaveBeenCalled();
      expect(bcrypt.hash).toHaveBeenCalledWith(
        createUsuarioDto.senha,
        'mockSalt',
      );
      expect(mockUsuarioRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: createUsuarioDto.email,
          senha: 'mockHashedPassword',
          perfis: [{ id: 1 }, { id: 2 }],
        }),
      );
      expect(result).not.toHaveProperty('senha');
      expect(result).toHaveProperty('perfis');
    });

    it('should create a user successfully without password', async () => {
      const createUsuarioDto: CreateUsuarioDto = {
        email: 'test@example.com',
      };

      mockUsuarioRepository.findByEmail.mockResolvedValue(null);
      mockUsuarioRepository.create.mockResolvedValue({
        id: 1,
        ...createUsuarioDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Ensure bcrypt methods are not called
      (bcrypt.genSalt as jest.Mock).mockClear();
      (bcrypt.hash as jest.Mock).mockClear();

      const result = await service.create(createUsuarioDto);

      expect(result).toBeDefined();
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        createUsuarioDto.email,
      );
      expect(bcrypt.genSalt).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(mockUsuarioRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: createUsuarioDto.email,
          senha: undefined,
        }),
      );
      expect(result).not.toHaveProperty('senha');
    });

    it('should throw a ConflictException if email already exists', async () => {
      const createUsuarioDto: CreateUsuarioDto = {
        email: 'test@example.com',
        senha: 'password123',
      };

      mockUsuarioRepository.findByEmail.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        senha: 'hashedpassword',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.create(createUsuarioDto)).rejects.toThrow(
        new ConflictException('Usuário com este e-mail já cadastrado.'),
      );
    });
  });

  describe('findOne', () => {
    it('should return a single usuario when user requests their own data', async () => {
      const expectedUsuario = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        perfis: [{ id: 1, codigo: 'USER' }],
      };
      mockUsuarioRepository.findOne.mockResolvedValue(expectedUsuario);

      const result = await service.findOne(1, {
        userId: 1,
        email: 'test@example.com',
      });

      expect(result).toEqual({
        id: 1,
        email: 'test@example.com',
        createdAt: expectedUsuario.createdAt,
        updatedAt: expectedUsuario.updatedAt,
      });
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1);
      expect(result).not.toHaveProperty('senha');
      expect(result).not.toHaveProperty('perfis');
    });

    it('should return a single usuario when admin requests any user data', async () => {
      const expectedUsuario = {
        id: 1,
        email: 'test@example.com',
        senha: 'hashedPassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        perfis: [{ id: 1, codigo: 'USER' }],
      };
      mockUsuarioRepository.findOne.mockResolvedValue(expectedUsuario);

      const result = await service.findOne(1, {
        userId: 99,
        email: 'admin@example.com',
        perfis: [{ codigo: 'ADMIN' }],
      });

      expect(result).toEqual({
        id: 1,
        email: 'test@example.com',
        createdAt: expectedUsuario.createdAt,
        updatedAt: expectedUsuario.updatedAt,
      });
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1);
      expect(result).not.toHaveProperty('senha');
      expect(result).not.toHaveProperty('perfis');
    });

    it('should throw ForbiddenException when user tries to access another user data', async () => {
      const usuario = {
        id: 1,
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUsuarioRepository.findOne.mockResolvedValue(usuario);

      await expect(
        service.findOne(1, { userId: 2, email: 'other@example.com' }),
      ).rejects.toThrow(
        new ForbiddenException(
          'Você não tem permissão para acessar os dados deste usuário',
        ),
      );
    });

    it('should throw NotFoundException if usuario not found', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(undefined);

      await expect(
        service.findOne(999, { userId: 999, email: 'test@example.com' }),
      ).rejects.toThrow(
        new NotFoundException('Usuário com ID 999 não encontrado'),
      );
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(999);
    });
  });
});
