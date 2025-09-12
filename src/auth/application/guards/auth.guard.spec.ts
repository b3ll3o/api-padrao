import { AuthGuard } from './auth.guard';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport'; // Import the original AuthGuard

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let reflector: Reflector;
  let mockExecutionContext: ExecutionContext;
  let mockRequest: any;
  let passportAuthGuardCanActivateSpy: jest.SpyInstance;

  beforeEach(() => {
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

    // Spy on the canActivate method of the *actual* PassportAuthGuard prototype
    // This allows us to control its behavior when super.canActivate is called
    passportAuthGuardCanActivateSpy = jest.spyOn(
      PassportAuthGuard('jwt').prototype,
      'canActivate',
    );
  });

  afterEach(() => {
    passportAuthGuardCanActivateSpy.mockRestore(); // Clean up the spy after each test
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
    // Ensure the PassportAuthGuard's canActivate was NOT called for public routes
    expect(passportAuthGuardCanActivateSpy).not.toHaveBeenCalled();
  });

  it('should return true and set usuarioLogado if not public and authentication succeeds', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    passportAuthGuardCanActivateSpy.mockResolvedValue(true); // Simulate successful authentication

    const result = await guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      expect.any(Array),
    );
    expect(passportAuthGuardCanActivateSpy).toHaveBeenCalledWith(
      mockExecutionContext,
    );
    expect(mockRequest.usuarioLogado).toEqual(mockRequest.user);
  });

  it('should return false if not public and authentication fails', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    passportAuthGuardCanActivateSpy.mockResolvedValue(false); // Simulate failed authentication

    const result = await guard.canActivate(mockExecutionContext);
    expect(result).toBe(false);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      expect.any(Array),
    );
    expect(passportAuthGuardCanActivateSpy).toHaveBeenCalledWith(
      mockExecutionContext,
    );
    expect(mockRequest.usuarioLogado).toBeUndefined();
  });

  it('should re-throw error if super.canActivate throws an error', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const error = new Error('Authentication failed');
    passportAuthGuardCanActivateSpy.mockRejectedValue(error);

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      error,
    );
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      expect.any(Array),
    );
    expect(passportAuthGuardCanActivateSpy).toHaveBeenCalledWith(
      mockExecutionContext,
    );
    expect(mockRequest.usuarioLogado).toBeUndefined();
  });
});
