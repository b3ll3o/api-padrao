// TDD: src/shared/infrastructure/middleware/cache-control.middleware.spec.ts
// BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: HTTP Hardening
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-1
// ATDD: test/http-hardening.e2e-spec.ts

import { CacheControlMiddleware } from './cache-control.middleware';

describe('CacheControlMiddleware', () => {
  let middleware: CacheControlMiddleware;
  let mockReq: { url: string };
  let mockRes: { setHeader: jest.Mock; headers: Record<string, string> };
  let mockNext: jest.Mock;

  beforeEach(() => {
    middleware = new CacheControlMiddleware();
    mockReq = { url: '/usuarios' };
    mockRes = { headers: {}, setHeader: jest.fn() };
    mockRes.setHeader.mockImplementation((k: string, v: string) => {
      mockRes.headers[k] = v;
    });
    mockNext = jest.fn();
  });

  it('deve setar Cache-Control: no-store em /auth/login', () => {
    mockReq.url = '/auth/login';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(mockNext).toHaveBeenCalled();
  });

  it('deve setar Cache-Control: no-store em /usuarios', () => {
    mockReq.url = '/usuarios';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('deve setar Cache-Control: no-store em /usuarios/123', () => {
    mockReq.url = '/usuarios/123';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('deve setar Cache-Control: no-store em /usuarios?email=foo@bar', () => {
    mockReq.url = '/usuarios?email=foo@bar';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('NÃO deve setar Cache-Control em /health/live', () => {
    mockReq.url = '/health/live';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).not.toHaveBeenCalled();
  });

  it('NÃO deve setar Cache-Control em /swagger', () => {
    mockReq.url = '/swagger';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).not.toHaveBeenCalled();
  });

  it('NÃO deve setar Cache-Control em /', () => {
    mockReq.url = '/';
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockRes.setHeader).not.toHaveBeenCalled();
  });

  it('deve chamar next() em todos os casos', () => {
    middleware.use(mockReq as never, mockRes as never, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});
