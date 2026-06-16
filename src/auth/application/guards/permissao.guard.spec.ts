import { PermissaoGuard } from './permissao.guard';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSAO_KEY } from '../decorators/temPermissao.decorator';

describe('PermissaoGuard', () => {
  let guard: PermissaoGuard;
  let reflector: Reflector;
  let mockExecutionContext: ExecutionContext;
  let mockRequest: any;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissaoGuard(reflector);

    mockRequest = {
      usuarioLogado: undefined, // Default to no user logged in
      headers: {},
    };

    mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  });

  it('deve ser definido', () => {
    expect(guard).toBeInstanceOf(PermissaoGuard);
  });

  it('deve retornar true se nenhuma permissão obrigatória for definida para a rota', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const result = guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      PERMISSAO_KEY,
      expect.any(Array),
    );
  });

  it('deve lançar ForbiddenException se o usuário não estiver logado', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('some_permission');
    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui empresas ou permissões suficientes.',
      ),
    );
  });

  it('deve lançar ForbiddenException se o usuário não tiver a propriedade empresas', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('some_permission');
    mockRequest.usuarioLogado = { userId: 1, email: 'test@example.com' }; // No 'empresas' property

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui empresas ou permissões suficientes.',
      ),
    );
  });

  it('deve lançar ForbiddenException se o ID da empresa não for informado no header', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('some_permission');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [{ id: 'empresa-1', perfis: [] }],
    };
    mockRequest.headers = {};

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'O ID da empresa (x-empresa-id) deve ser informado no header para validar as permissões.',
      ),
    );
  });

  it('deve lançar ForbiddenException se o usuário não tiver acesso à empresa informada', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('REQUIRED_PERMISSION');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-a',
          perfis: [
            {
              codigo: 'ADMIN',
              permissoes: [{ codigo: 'REQUIRED_PERMISSION' }],
            },
          ],
        },
      ],
    };
    mockRequest.headers = { 'x-empresa-id': 'empresa-b' };

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui acesso a esta empresa ou não possui perfis vinculados.',
      ),
    );
  });

  it('deve retornar true se o usuário tiver a permissão necessária na empresa correta', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('REQUIRED_PERMISSION');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-a',
          perfis: [
            {
              codigo: 'ADMIN',
              permissoes: [{ codigo: 'REQUIRED_PERMISSION' }],
            },
          ],
        },
      ],
    };
    mockRequest.headers = { 'x-empresa-id': 'empresa-a' };

    const result = guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
    expect(mockRequest.empresaContext).toBeDefined();
    expect(mockRequest.empresaContext.id).toBe('empresa-a');
  });

  it('deve lançar ForbiddenException se o usuário estiver na empresa correta, mas não tiver a permissão', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('REQUIRED_PERMISSION');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-a',
          perfis: [
            { codigo: 'USER', permissoes: [{ codigo: 'OTHER_PERMISSION' }] },
          ],
        },
      ],
    };
    mockRequest.headers = { 'x-empresa-id': 'empresa-a' };

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui permissões suficientes para acessar este recurso nesta empresa.',
      ),
    );
  });

  it('deve retornar true se o usuário tiver uma das múltiplas permissões necessárias na empresa correta', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['PERMISSION_A', 'PERMISSION_B']);
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-a',
          perfis: [
            { codigo: 'EDITOR', permissoes: [{ codigo: 'PERMISSION_B' }] },
          ],
        },
      ],
    };
    mockRequest.headers = { 'x-empresa-id': 'empresa-a' };

    const result = guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
  });

  it('deve tratar array vazio como permissões requeridas (segue para checar empresa)', () => {
    // Empty array é truthy em JS — guard não retorna true antecipadamente.
    // Continua para verificar empresaId e permissões (vai falhar no header).
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [],
    };

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'O ID da empresa (x-empresa-id) deve ser informado no header para validar as permissões.',
      ),
    );
  });

  it('deve anexar empresaContext com a empresa correta (não a primeira do array)', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('REQUIRED_PERMISSION');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-1',
          perfis: [{ codigo: 'USER', permissoes: [{ codigo: 'OTHER' }] }],
        },
        {
          id: 'empresa-2',
          perfis: [
            {
              codigo: 'ADMIN',
              permissoes: [{ codigo: 'REQUIRED_PERMISSION' }],
            },
          ],
        },
      ],
    };
    mockRequest.headers = { 'x-empresa-id': 'empresa-2' };

    const result = guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
    // Anexa a empresa com permissão, não a primeira
    expect(mockRequest.empresaContext.id).toBe('empresa-2');
  });

  it('NÃO deve conceder acesso por permissão em OUTRA empresa do mesmo usuário', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('REQUIRED_PERMISSION');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-com-permissao',
          perfis: [
            {
              codigo: 'ADMIN',
              permissoes: [{ codigo: 'REQUIRED_PERMISSION' }],
            },
          ],
        },
        {
          id: 'empresa-sem-permissao',
          perfis: [{ codigo: 'USER', permissoes: [{ codigo: 'OTHER' }] }],
        },
      ],
    };
    // Tenta acessar a empresa SEM a permissão
    mockRequest.headers = { 'x-empresa-id': 'empresa-sem-permissao' };

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui permissões suficientes para acessar este recurso nesta empresa.',
      ),
    );
  });

  it('deve lidar com perfil sem campo permissoes (undefined) sem quebrar', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('REQUIRED_PERMISSION');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-a',
          perfis: [
            { codigo: 'PERFIL_SEM_PERMISSOES' }, // sem campo permissoes
          ],
        },
      ],
    };
    mockRequest.headers = { 'x-empresa-id': 'empresa-a' };

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui permissões suficientes para acessar este recurso nesta empresa.',
      ),
    );
  });

  it('deve permitir acesso se um dos perfis tiver a permissão (qualquer perfil)', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('TARGET_PERMISSION');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      empresas: [
        {
          id: 'empresa-a',
          perfis: [
            { codigo: 'USER', permissoes: [{ codigo: 'OTHER_1' }] },
            { codigo: 'EDITOR', permissoes: [{ codigo: 'OTHER_2' }] },
            {
              codigo: 'ADMIN',
              permissoes: [{ codigo: 'TARGET_PERMISSION' }],
            },
          ],
        },
      ],
    };
    mockRequest.headers = { 'x-empresa-id': 'empresa-a' };

    const result = guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
  });
});
