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
    expect(guard).toBeDefined();
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
});
