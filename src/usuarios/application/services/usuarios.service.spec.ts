import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosService } from './usuarios.service';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { ConflictException } from '@nestjs/common';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';

describe('UsuariosService', () => {
  let service: UsuariosService;

  const mockUsuarioRepository = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a user successfully', async () => {
      const createUsuarioDto: CreateUsuarioDto = {
        email: 'test@example.com',
        senha: 'password123',
      };

      mockUsuarioRepository.findByEmail.mockResolvedValue(null);
      mockUsuarioRepository.create.mockResolvedValue({
        id: 1,
        ...createUsuarioDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(createUsuarioDto);

      expect(result).toBeDefined();
      expect(mockUsuarioRepository.findByEmail).toHaveBeenCalledWith(
        createUsuarioDto.email,
      );
      expect(mockUsuarioRepository.create).toHaveBeenCalled();
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
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    it('should return a single usuario when user requests their own data', async () => {
      const expectedUsuario = {
        id: 1,
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUsuarioRepository.findOne.mockResolvedValue(expectedUsuario);

      const result = await service.findOne(1, {
        userId: 1,
        email: 'test@example.com',
      });

      expect(result).toEqual(expectedUsuario);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw ForbiddenException when user tries to access another user data', async () => {
      const usuario = {
        id: 1,
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUsuarioRepository.findOne.mockResolvedValue(usuario);

      await expect(() =>
        service.findOne(1, { userId: 2, email: 'other@example.com' }),
      ).rejects.toThrow(
        'Você não tem permissão para acessar os dados deste usuário',
      );
    });

    it('should throw NotFoundException if usuario not found', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(undefined);

      await expect(() =>
        service.findOne(999, { userId: 999, email: 'test@example.com' }),
      ).rejects.toThrow('Usuário com ID 999 não encontrado');
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(999);
    });
  });
});
