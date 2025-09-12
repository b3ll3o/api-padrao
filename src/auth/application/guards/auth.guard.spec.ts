import { AuthGuard } from './auth.guard';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let reflector: Reflector;
  let mockExecutionContext: ExecutionContext;
  let mockRequest: any;

  // Get a reference to the mocked AuthGuard's canActivate method
  let passportAuthGuardCanActivateMock: jest.Mock;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    reflector = new Reflector();
    guard = new AuthGuard(reflector);

    mockRequest = {
      user: { userId: 1, email: 'test@example.com' },
    };

    mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;

    // Get the mock instance of canActivate from the mocked AuthGuard
    // This needs to be done after `guard = new AuthGuard(reflector);`
    // because the mockImplementation creates the class instance.
    passportAuthGuardCanActivateMock = (guard as any).canActivate;
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return true if route is public', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const result = await guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      expect.any(Array),
    );
    // No need to check passportAuthGuardCanActivateMock here as we are mocking guard.canActivate directly
  });

  it('should return true and set usuarioLogado if not public and authentication succeeds', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    // Mock the actual canActivate of the parent guard to return true
    jest
      .spyOn(
        jest.requireActual('@nestjs/passport').AuthGuard('jwt').prototype,
        'canActivate',
      )
      .mockResolvedValue(true);

    const result = await guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      expect.any(Array),
    );
    expect(passportAuthGuardCanActivateMock).toHaveBeenCalledWith(
      mockExecutionContext,
    );
    expect(mockRequest.usuarioLogado).toEqual(mockRequest.user);
  });

  it('should return false if not public and authentication fails', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    // Mock the actual canActivate of the parent guard to return false
    jest
      .spyOn(
        jest.requireActual('@nestjs/passport').AuthGuard('jwt').prototype,
        'canActivate',
      )
      .mockResolvedValue(false);

    const result = await guard.canActivate(mockExecutionContext);
    expect(result).toBe(false);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      expect.any(Array),
    );
    expect(passportAuthGuardCanActivateMock).toHaveBeenCalledWith(
      mockExecutionContext,
    );
    expect(mockRequest.usuarioLogado).toBeUndefined();
  });
});
