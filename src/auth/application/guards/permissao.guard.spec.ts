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
    };

    mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return true if no required permissions are set for the route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const result = guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      PERMISSAO_KEY,
      expect.any(Array),
    );
  });

  it('should throw ForbiddenException if user is not logged in', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('some_permission');
    mockRequest.usuarioLogado = undefined;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui perfis ou permissões suficientes.',
      ),
    );
  });

  it('should throw ForbiddenException if user has no profiles property', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('some_permission');
    mockRequest.usuarioLogado = { userId: 1, email: 'test@example.com' }; // No 'perfis' property

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui perfis ou permissões suficientes.',
      ),
    );
  });

  it('should throw ForbiddenException if user has profiles but no matching permissions', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('REQUIRED_PERMISSION');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      perfis: [
        {
          codigo: 'USER',
          permissoes: [{ codigo: 'OTHER_PERMISSION' }],
        },
      ],
    };

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui permissões suficientes para acessar este recurso.',
      ),
    );
  });

  it('should return true if user has the required single permission', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue('REQUIRED_PERMISSION');
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      perfis: [
        {
          codigo: 'ADMIN',
          permissoes: [{ codigo: 'REQUIRED_PERMISSION' }],
        },
      ],
    };

    const result = guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
  });

  it('should return true if user has one of the required multiple permissions', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['PERMISSION_A', 'PERMISSION_B']);
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      perfis: [
        {
          codigo: 'EDITOR',
          permissoes: [{ codigo: 'PERMISSION_B' }],
        },
      ],
    };

    const result = guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException if user has profiles but none of the required multiple permissions', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['PERMISSION_A', 'PERMISSION_B']);
    mockRequest.usuarioLogado = {
      userId: 1,
      email: 'test@example.com',
      perfis: [
        {
          codigo: 'VIEWER',
          permissoes: [{ codigo: 'OTHER_PERMISSION' }],
        },
      ],
    };

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        'Usuário não possui permissões suficientes para acessar este recurso.',
      ),
    );
  });
});
