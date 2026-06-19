// TDD: src/shared/infrastructure/metrics/http-metrics.interceptor.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-METRICS-001..005
// ATDD: test/metrics.e2e-spec.ts
import { lastValueFrom, of } from 'rxjs';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsRegistry } from './registry';

describe('HttpMetricsInterceptor', () => {
  let registry: MetricsRegistry;
  let interceptor: HttpMetricsInterceptor;

  beforeEach(() => {
    registry = new MetricsRegistry();
    interceptor = new HttpMetricsInterceptor(registry);
  });

  const buildContext = (req: any, res: any = { statusCode: 200 }) =>
    ({
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    }) as any;

  it('incrementa http_requests_total e observa http_request_duration_ms em 2xx', async () => {
    const req = {
      method: 'GET',
      url: '/api/v1/usuarios/42',
      route: { path: '/api/v1/usuarios/:id' },
    };
    const res = { statusCode: 200 };

    const obs$ = interceptor.intercept(buildContext(req, res), {
      handle: () => of('ok'),
    } as any);
    await lastValueFrom(obs$);

    const labels = {
      method: 'GET',
      route: '/api/v1/usuarios/:id',
      status: '200',
    };
    expect(registry.httpRequests.getValue(labels)).toBe(1);
    expect(registry.httpDurationMs.getCount(labels)).toBe(1);
    expect(registry.httpErrors.getValue(labels)).toBe(0);
  });

  it('contabiliza erros 4xx em http_request_errors_total', async () => {
    const req = {
      method: 'POST',
      url: '/api/v1/usuarios',
      route: { path: '/api/v1/usuarios' },
    };
    const res = { statusCode: 404 };

    await lastValueFrom(
      interceptor.intercept(buildContext(req, res), {
        handle: () => of('x'),
      } as any),
    );

    const labels = {
      method: 'POST',
      route: '/api/v1/usuarios',
      status: '404',
    };
    expect(registry.httpRequests.getValue(labels)).toBe(1);
    expect(registry.httpErrors.getValue(labels)).toBe(1);
  });

  it('contabiliza erros 5xx com route parametrizado (NÃO a URL crua)', async () => {
    const req = {
      method: 'GET',
      url: '/api/v1/perfis/9999',
      route: { path: '/api/v1/perfis/:id' },
    };
    const res = { statusCode: 500 };

    await lastValueFrom(
      interceptor.intercept(buildContext(req, res), {
        handle: () => of('x'),
      } as any),
    );

    // Cardinalidade controlada: usa route paramétrica
    expect(
      registry.httpRequests.getValue({
        method: 'GET',
        route: '/api/v1/perfis/:id',
        status: '500',
      }),
    ).toBe(1);
    // URL crua NÃO vira label
    expect(
      registry.httpRequests.getValue({
        method: 'GET',
        route: '/api/v1/perfis/9999',
        status: '500',
      }),
    ).toBe(0);
  });

  it('NÃO instrumenta /health, /metrics e / (são excluídos)', async () => {
    for (const path of ['/health', '/metrics', '/']) {
      const req = { method: 'GET', url: path };
      await lastValueFrom(
        interceptor.intercept(buildContext(req), {
          handle: () => of('x'),
        } as any),
      );
    }
    // Nenhuma métrica deve ter sido incrementada
    expect(registry.httpRequests.getValue()).toBe(0);
  });

  it('strip query string antes de classificar como excluído', async () => {
    const req = { method: 'GET', url: '/health?check=db' };
    await lastValueFrom(
      interceptor.intercept(buildContext(req), {
        handle: () => of('x'),
      } as any),
    );
    expect(registry.httpRequests.getValue()).toBe(0);
  });

  it('cai para pathOnly quando req.route.path é undefined', async () => {
    const req = { method: 'GET', url: '/api/v1/unknown' }; // sem route
    await lastValueFrom(
      interceptor.intercept(buildContext(req), {
        handle: () => of('x'),
      } as any),
    );
    expect(
      registry.httpRequests.getValue({
        method: 'GET',
        route: '/api/v1/unknown',
        status: '200',
      }),
    ).toBe(1);
  });

  it('registra erro quando observable emite error', async () => {
    const req = {
      method: 'PUT',
      url: '/api/v1/x',
      route: { path: '/api/v1/x' },
    };
    const res = { statusCode: 500 };

    const errorHandler = {
      handle: () =>
        new Observable((sub) => {
          sub.error(new Error('boom'));
        }),
    } as any;

    await expect(
      lastValueFrom(
        interceptor.intercept(buildContext(req, res), errorHandler),
      ),
    ).rejects.toThrow('boom');

    expect(
      registry.httpRequests.getValue({
        method: 'PUT',
        route: '/api/v1/x',
        status: '500',
      }),
    ).toBe(1);
  });
});

// Helper para Observable (re-aproveita rxjs)
import { Observable } from 'rxjs';
