import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsuariosService } from './usuarios.service';
import { UsuarioRepository } from '../../domain/repositories/usuario.repository';
import { CreateUsuarioDto } from '../../dto/create-usuario.dto';
import { Usuario } from '../../domain/entities/usuario.entity';
import { UpdateUsuarioDto } from '../../dto/update-usuario.dto';
import { JwtPayload } from 'src/auth/infrastructure/strategies/jwt.strategy';
import { PasswordHasher } from 'src/shared/domain/services/password-hasher.service';
import { IUsuarioAuthorizationService } from './usuario-authorization.service';
import { EmpresaRepository } from '../../../empresas/domain/repositories/empresa.repository';
import {
  EMAIL_SENDER_SERVICE,
  EmailSenderService,
} from '../../../shared/application/services/email-sender.service';
import { RefreshTokenRepository } from '../../../auth/domain/repositories/refresh-token.repository';
import { UnitOfWork } from '../../../auth/domain/services/unit-of-work.service';

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
    // [A5] Cache invalidation port — chamadas em update().
    invalidateUserCache: jest.Mock;
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
  let mockConfigService: { get: jest.Mock };
  let mockEmailSender: jest.Mocked<EmailSenderService>;
  // [H4] Mock da porta `RefreshTokenRepository` injetada em `UsuariosService`
  // para revogar tokens ativos quando a senha é alterada.
  let mockRefreshTokenRepository: {
    create: jest.Mock;
    findByTokenWithUser: jest.Mock;
    revoke: jest.Mock;
    revokeAllForUser: jest.Mock;
  };
  // [A3] Mock do UnitOfWork — executa o callback com um `tx` mockado que
  // responde a `findUnique`/`updateMany` de forma determinística.
  let mockUnitOfWork: {
    execute: jest.Mock;
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
      // [A5]
      invalidateUserCache: jest.fn().mockResolvedValue(undefined),
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
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'APP_NAME') return 'API Padrão';
        if (key === 'APP_LOGIN_URL') return 'http://localhost:3000';
        return null;
      }),
    };
    mockEmailSender = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    // [H4] Mock da porta RefreshTokenRepository.
    mockRefreshTokenRepository = {
      create: jest.fn(),
      findByTokenWithUser: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    };

    // [A3] Mock do UnitOfWork. `execute(callback)` invoca o callback com
    // um `tx` que reflete o estado atual do `mockUsuarioRepository.findOne`
    // (preCheck) — coerência entre o que o service lê na pré-verificação
    // e o que relê dentro da transação.
    //
    // O `tx.usuario.findUnique` responde de forma diferente em cada
    // chamada:
    //  - 1ª: re-leitura (current state) — espelha o preCheck
    //  - 2ª: leitura final (post-mutate) — espelha o preCheck com
    //    `ativo`/`deletedAt` refletindo o resultado da intenção
    //    (restore → deletedAt=null, softDelete → deletedAt=now, ativo=false).
    mockUnitOfWork = {
      execute: jest.fn().mockImplementation(async (cb: (tx: any) => any) => {
        const pre =
          (await mockUsuarioRepository.findOne.getMockImplementation())
            ? await mockUsuarioRepository.findOne()
            : null;
        const base = pre
          ? {
              id: pre.id,
              email: pre.email,
              ativo: pre.ativo,
              deletedAt: pre.deletedAt,
              createdAt: pre.createdAt ?? new Date(),
              updatedAt: pre.updatedAt ?? new Date(),
            }
          : {
              id: 1,
              email: 'a@b.c',
              ativo: true,
              deletedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
        // Clone para evitar mutação entre chamadas
        let callIndex = 0;
        const findUniqueMock = jest.fn().mockImplementation(async () => {
          const snapshot = { ...base };
          callIndex += 1;
          // 2ª chamada = post-mutate. Se o caller passou um mock de
          // `update`/post-state diferente, deixa ele controlar via spy.
          if (callIndex === 2) {
            snapshot.createdAt = snapshot.createdAt ?? new Date();
            snapshot.updatedAt = new Date();
          }
          return snapshot;
        });
        const tx = {
          usuario: {
            findUnique: findUniqueMock,
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          refreshToken: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return cb(tx);
      }),
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
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EMAIL_SENDER_SERVICE, useValue: mockEmailSender },
        // [H4] Bind da porta RefreshTokenRepository.
        {
          provide: RefreshTokenRepository,
          useValue: mockRefreshTokenRepository,
        },
        // [A3] Bind do UnitOfWork.
        {
          provide: UnitOfWork,
          useValue: mockUnitOfWork,
        },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  it('deve ser definido', () => {
    expect(service).toBeInstanceOf(UsuariosService);
  });

  describe('criação', () => {
    // REQ-USER-001: POST /usuarios (público, auto-cadastro)
    // REQ-USER-006: 409 se email já existe
    // REQ-USER-007: persistir senha como bcrypt (custo 10)
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

    // REQ-USER-006: 409 quando email já existe
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

    // REQ-USER-010: GET /usuarios paginado
    // REQ-USER-011: exigir permissão READ_USUARIOS
    // REQ-USER-014: default exclui soft-deletados
    // REQ-USER-015: 403 sem perfil ADMIN
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

    // REQ-USER-015: 403 sem ADMIN
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

    // REQ-USER-020: GET /usuarios/:id
    // REQ-USER-022: próprio userId no token acessa sem checagem extra
    // REQ-USER-024: 403 quando não-próprio e não-ADMIN
    // REQ-USER-025: 404 quando id inexistente ou soft-deletado
    it('deve retornar um usuário se encontrado e permitido', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne(1, mockUsuarioLogado);

      expect(result).toEqual(mockUser);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, false);
    });

    // REQ-USER-025: 404 quando id não existe
    it('lança NotFoundException quando o usuário não existe', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne(99, mockUsuarioLogado)).rejects.toThrow(
        NotFoundException,
      );
    });

    // REQ-USER-024: 403 quando canAccessUsuario=false
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

    // REQ-USER-030: PATCH /usuarios/:id
    // REQ-USER-031: exigir permissão UPDATE_USUARIO
    // REQ-USER-033: próprio user pode atualizar email/senha
    // REQ-USER-034: ADMIN pode atualizar qualquer usuário
    // REQ-USER-038: 409 se novo email pertence a outro usuário
    it('deve atualizar um usuário se encontrado e permitido', async () => {
      const updateDto: UpdateUsuarioDto = { email: 'updated@example.com' };

      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);
      mockUsuarioRepository.findByEmail.mockResolvedValue(null);

      const result = await service.update(1, updateDto, mockAdminUsuarioLogado);

      // [A3] Verifica que a operação foi executada dentro de uma transação
      // atômica via UnitOfWork.execute, e que o findOne pré-transação foi
      // chamado com includeDeleted=true.
      expect(mockUnitOfWork.execute).toHaveBeenCalledTimes(1);
      expect(mockUsuarioRepository.findOne).toHaveBeenCalledWith(1, true);
      // O entity final vem da tx.usuario.findUnique (2ª chamada na tx),
      // que reflete o estado do mockUsuarioRepository.findOne (preCheck).
      expect(result.email).toBe('test@example.com');
    });

    it('lança NotFoundException quando o usuário não existe', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(null);
      await expect(
        service.update(99, { email: 'x' }, mockAdminUsuarioLogado, 'empresa-1'),
      ).rejects.toThrow(NotFoundException);
    });

    // REQ-USER-039: re-hash da senha com bcrypt ao alterar
    it('hasheia a senha quando enviada', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);

      await service.update(
        1,
        { senha: 'NewP@ss1' },
        mockAdminUsuarioLogado,
        'empresa-1',
      );
      expect(mockPasswordHasher.hash).toHaveBeenCalledWith('NewP@ss1');
    });

    // [H4] DevSecOps 2026-06-21 — defesa em profundidade.
    // Quando a senha é alterada via `update()`, TODOS os refresh tokens
    // ativos do usuário devem ser revogados para evitar que um cookie
    // exfiltrado permaneça válido até o TTL de 2 dias.
    //
    // [A3] A revogação agora acontece DENTRO da transação Prisma
    // (tx.refreshToken.updateMany), não mais via
    // refreshTokenRepository.revokeAllForUser. Isso garante atomicidade
    // entre a troca de senha e a revogação.
    it('[H4/A3] revoga refresh tokens dentro da transação quando senha muda', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);

      await service.update(
        1,
        { senha: 'NewP@ss1' },
        mockAdminUsuarioLogado,
        'empresa-1',
      );

      const workCallback = mockUnitOfWork.execute.mock.calls[0][0];
      const stubTx = {
        usuario: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
            email: 'a@b.c',
            ativo: true,
            deletedAt: null,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        refreshToken: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      await workCallback(stubTx);
      expect(stubTx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(
        mockRefreshTokenRepository.revokeAllForUser,
      ).not.toHaveBeenCalled();
    });

    // [H4] O caller (admin ou self-service) NÃO recebe um novo refresh
    // token aqui — ele terá que logar novamente. Isso é parte da defesa:
    // garantimos que tokens antigos NÃO continuam válidos.
    it('[H4] NÃO revoga tokens quando apenas o email é alterado', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);
      mockUsuarioRepository.findByEmail.mockResolvedValue(null);

      await service.update(
        1,
        { email: 'novo@example.com' },
        mockAdminUsuarioLogado,
        'empresa-1',
      );

      const workCallback = mockUnitOfWork.execute.mock.calls[0][0];
      const stubTx = {
        usuario: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
            email: 'a@b.c',
            ativo: true,
            deletedAt: null,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        refreshToken: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      await workCallback(stubTx);
      expect(stubTx.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    // [H4] Soft-delete (ativo:false) NÃO deve revogar refresh tokens —
    // é uma mudança ortogonal à senha. Mantém a invariante: apenas
    // mudança de senha dispara revogação.
    it('[H4] NÃO revoga tokens quando apenas soft-delete é feito', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue({
        ...mockUser,
        deletedAt: null,
      });

      await service.update(
        1,
        { ativo: false },
        mockAdminUsuarioLogado,
        'empresa-1',
      );

      const workCallback = mockUnitOfWork.execute.mock.calls[0][0];
      const stubTx = {
        usuario: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
            email: 'a@b.c',
            ativo: true,
            deletedAt: null,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        refreshToken: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      await workCallback(stubTx);
      expect(stubTx.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    // [H4] Se a revogação falhar, a operação de update também deve falhar
    // (atomicidade — auditoria exige consistência entre senha alterada
    // e tokens revogados).
    it('[H4/A3] propaga erro se tx.refreshToken.updateMany falhar', async () => {
      mockUsuarioRepository.findOne.mockResolvedValue(mockUser);
      mockUnitOfWork.execute.mockImplementationOnce(async (cb: any) => {
        const tx = {
          usuario: {
            findUnique: jest.fn().mockResolvedValue({
              id: 1,
              email: 'a@b.c',
              ativo: true,
              deletedAt: null,
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          refreshToken: {
            updateMany: jest.fn().mockRejectedValue(new Error('DB timeout')),
          },
        };
        return cb(tx);
      });

      await expect(
        service.update(
          1,
          { senha: 'NewP@ss1' },
          mockAdminUsuarioLogado,
          'empresa-1',
        ),
      ).rejects.toThrow('DB timeout');
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

    // ===================== [A3] NOVOS TESTES =====================

    describe('[A3] atomicidade transacional', () => {
      it('[A3] envolve update em unitOfWork.execute (1 chamada)', async () => {
        mockUsuarioRepository.findOne.mockResolvedValue(mockUser);

        await service.update(
          1,
          { email: 'novo@example.com' },
          mockAdminUsuarioLogado,
          'empresa-1',
        );

        expect(mockUnitOfWork.execute).toHaveBeenCalledTimes(1);
        expect(typeof mockUnitOfWork.execute.mock.calls[0][0]).toBe('function');
      });

      // [A3] Race scenario do HIGH finding DevSecOps 2026-06-21:
      // 2 admins chamam PATCH /usuarios/5 { ativo: false } simultaneamente.
      // Antes: ambos liam deletedAt=null, ambos tentavam soft-delete, e o
      // segundo findOne+update gerava estado inconsistente. Agora: o
      // updateMany com WHERE deletedAt:null só afeta a 1ª request; a 2ª
      // vê count=0 → 409 ConflictException.
      it('[A3] race: 2 PATCH simultâneos — segundo retorna 409 ConflictException', async () => {
        mockUsuarioRepository.findOne.mockResolvedValue({
          ...mockUser,
          deletedAt: null,
        });

        let callCount = 0;
        mockUnitOfWork.execute.mockImplementation(async (cb: any) => {
          callCount += 1;
          const tx = {
            usuario: {
              findUnique: jest.fn().mockResolvedValue({
                id: 1,
                email: 'a@b.c',
                ativo: true,
                deletedAt: null,
              }),
              updateMany: jest.fn().mockResolvedValue({
                count: callCount === 1 ? 1 : 0,
              }),
            },
            refreshToken: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          };
          return cb(tx);
        });

        // 1ª chamada: sucesso (count=1)
        await expect(
          service.update(
            1,
            { ativo: false },
            mockAdminUsuarioLogado,
            'empresa-1',
          ),
        ).resolves.toBeDefined();

        // 2ª chamada: conflito (count=0 → ConflictException)
        await expect(
          service.update(
            1,
            { ativo: false },
            mockAdminUsuarioLogado,
            'empresa-1',
          ),
        ).rejects.toThrow(ConflictException);
      });

      // [A3] O guard deve usar `WHERE deletedAt: <expected>` para que o
      // Postgres faça row-level lock implícito via updateMany. Validamos
      // isso verificando os argumentos da chamada.
      it('[A3] updateMany usa WHERE com deletedAt esperado (row lock implícito)', async () => {
        const expectedDeletedAt = new Date('2026-01-01T00:00:00Z');
        mockUsuarioRepository.findOne.mockResolvedValue({
          ...mockUser,
          deletedAt: expectedDeletedAt,
        });

        mockUnitOfWork.execute.mockImplementationOnce(async (cb: any) => {
          const tx = {
            usuario: {
              findUnique: jest.fn().mockResolvedValue({
                id: 1,
                email: 'a@b.c',
                ativo: false,
                deletedAt: expectedDeletedAt,
              }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            refreshToken: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          };
          return cb(tx);
        });

        await service.update(
          1,
          { ativo: true },
          mockAdminUsuarioLogado,
          'empresa-1',
        );

        const workCallback = mockUnitOfWork.execute.mock.calls[0][0];
        const stubTx = {
          usuario: {
            findUnique: jest.fn().mockResolvedValue({
              id: 1,
              email: 'a@b.c',
              ativo: false,
              deletedAt: expectedDeletedAt,
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          refreshToken: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        };
        await workCallback(stubTx);

        // O primeiro updateMany (restore) deve carregar o `deletedAt`
        // esperado no WHERE — é o que faz o Postgres adquirir row-level
        // lock e detectar conflito se outro admin mudou o estado.
        expect(stubTx.usuario.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 1,
              deletedAt: expectedDeletedAt,
            }),
          }),
        );
      });

      // [A3] Happy path: email + senha + ativo alterados atomicamente.
      // Verifica que tudo acontece em uma única chamada de execute().
      it('[A3] happy path: email + senha + restore em uma única transação', async () => {
        const deletedAt = new Date('2026-01-01T00:00:00Z');
        mockUsuarioRepository.findOne.mockResolvedValue({
          ...mockUser,
          deletedAt,
        });
        mockUsuarioRepository.findByEmail.mockResolvedValue(null);

        let executedOperations = 0;
        mockUnitOfWork.execute.mockImplementationOnce(async (cb: any) => {
          const tx = {
            usuario: {
              findUnique: jest.fn().mockResolvedValue({
                id: 1,
                email: 'a@b.c',
                ativo: false,
                deletedAt,
              }),
              updateMany: jest.fn().mockImplementation(async () => {
                executedOperations += 1;
                return { count: 1 };
              }),
            },
            refreshToken: {
              updateMany: jest.fn().mockImplementation(async () => {
                executedOperations += 1;
                return { count: 1 };
              }),
            },
          };
          return cb(tx);
        });

        await service.update(
          1,
          {
            email: 'novo@example.com',
            senha: 'NewP@ss1',
            ativo: true,
          },
          mockAdminUsuarioLogado,
          'empresa-1',
        );

        // APENAS 1 chamada a unitOfWork.execute() — toda a operação é
        // uma única transação atômica.
        expect(mockUnitOfWork.execute).toHaveBeenCalledTimes(1);
        expect(executedOperations).toBeGreaterThanOrEqual(2);
      });
    });

    describe('soft delete / restore', () => {
      // REQ-USER-036: ADMIN restaura via ativo:true
      // [A3] Agora a restauração passa por updateMany dentro de transação.
      it('restaura usuário deletado quando ativo=true', async () => {
        const deletedAt = new Date('2026-01-01T00:00:00Z');
        mockUsuarioRepository.findOne.mockResolvedValue({
          ...mockUser,
          deletedAt,
        });

        const result = await service.update(
          1,
          { ativo: true },
          mockAdminUsuarioLogado,
          'empresa-1',
        );
        expect(result).toBeDefined();
        // A operação foi feita via tx, não via repository direto.
        expect(mockUsuarioRepository.restore).not.toHaveBeenCalled();
        expect(mockUnitOfWork.execute).toHaveBeenCalledTimes(1);
      });

      // REQ-USER-037: 409 ao restaurar usuario não-deletado
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

      // REQ-USER-037: 409 ao soft-deletar usuario ja deletado
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

    // REQ-USER-035: ADMIN soft delete via ativo:false
    // [A3] Agora via tx.usuario.updateMany WHERE deletedAt:null.
    it('deve realizar soft delete de um usuário via flag ativo', async () => {
      const nonDeletedUser = { ...mockUser, deletedAt: null };
      const updateDto: UpdateUsuarioDto = { ativo: false };

      mockUsuarioRepository.findOne.mockResolvedValue(nonDeletedUser);

      const result = await service.update(
        1,
        updateDto,
        mockAdminUsuarioLogado,
        'empresa-1',
      );

      expect(result).toBeDefined();
      // [A3] A mutação agora passa pela transação, não pelo repository
      // direto.
      expect(mockUsuarioRepository.remove).not.toHaveBeenCalled();
      expect(mockUnitOfWork.execute).toHaveBeenCalled();
    });
  });
});
