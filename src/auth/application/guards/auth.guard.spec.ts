import { AuthGuard } from './auth.guard';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// Mock the actual PassportAuthGuard from @nestjs/passport
const mockPassportAuthGuardCanActivate = jest.fn();

jest.mock('@nestjs/passport', () => ({
  AuthGuard: jest.fn().mockImplementation(() => {
    return class {
      // This is the mocked canActivate method that super.canActivate will call
      canActivate = mockPassportAuthGuardCanActivate;
      constructor() {}
    };
  }),
}));

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let reflector: Reflector;
  let mockExecutionContext: ExecutionContext;
  let mockRequest: any;

  beforeEach(() => {
    jest.clearAllMocks(); // Clear all mocks before each test

    reflector = new Reflector();
    guard = new AuthGuard(reflector); // Create the actual guard instance

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
    // Ensure the mocked PassportAuthGuard's canActivate was NOT called
    expect(mockPassportAuthGuardCanActivate).not.toHaveBeenCalled();
  });

  it('should return true and set usuarioLogado if not public and authentication succeeds', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    mockPassportAuthGuardCanActivate.mockResolvedValue(true); // Simulate successful authentication

    const result = await guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      expect.any(Array),
    );
    expect(mockPassportAuthGuardCanActivate).toHaveBeenCalledWith(mockExecutionContext);
    expect(mockRequest.usuarioLogado).toEqual(mockRequest.user);
  });

  it('should return false if not public and authentication fails', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    mockPassportAuthGuardCanActivate.mockResolvedValue(false); // Simulate failed authentication

    const result = await guard.canActivate(mockExecutionContext);
    expect(result).toBe(false);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      expect.any(Array),
    );
    expect(mockPassportAuthGuardCanActivate).toHaveBeenCalledWith(mockExecutionContext);
    expect(mockRequest.usuarioLogado).toBeUndefined();
  });

  it('should re-throw error if super.canActivate throws an error', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const error = new Error('Authentication failed');
    mockPassportAuthGuardCanActivate.mockRejectedValue(error);

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(error);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      expect.any(Array),
    );
    expect(mockPassportAuthGuardCanActivate).toHaveBeenCalledWith(mockExecutionContext);
    expect(mockRequest.usuarioLogado).toBeUndefined();
  });
});