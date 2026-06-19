// TDD: src/shared/infrastructure/metrics/registry.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-METRICS-001
// ATDD: test/metrics.e2e-spec.ts
import { Counter, Gauge, Histogram, MetricsRegistry } from './registry';

describe('Counter', () => {
  it('inicia em 0 quando não há observações', () => {
    const c = new Counter('foo_total');
    expect(c.serialize()).toContain('# TYPE foo_total counter');
    expect(c.serialize()).toContain('foo_total 0');
  });

  it('incrementa com e sem labels', () => {
    const c = new Counter('hits_total');
    c.inc();
    c.inc(2, { route: '/a' });
    c.inc(3, { route: '/a' });
    c.inc(1, { route: '/b' });

    expect(c.getValue()).toBe(1);
    expect(c.getValue({ route: '/a' })).toBe(5);
    expect(c.getValue({ route: '/b' })).toBe(1);

    const out = c.serialize();
    expect(out).toContain('hits_total 1');
    expect(out).toContain('hits_total{route="/a"} 5');
    expect(out).toContain('hits_total{route="/b"} 1');
  });

  it('escapa caracteres especiais em label values', () => {
    const c = new Counter('foo_total');
    c.inc(1, { msg: 'hello "world"\n bye' });
    const out = c.serialize();
    expect(out).toContain('foo_total{msg="hello \\"world\\"\\n bye"} 1');
  });
});

describe('Gauge', () => {
  it('set, inc, dec com labels', () => {
    const g = new Gauge('pool_active');
    g.set(5);
    g.inc(3);
    g.dec(2);
    g.set(10, { db: 'main' });
    g.inc(1, { db: 'main' });

    expect(g.getValue()).toBe(6);
    expect(g.getValue({ db: 'main' })).toBe(11);

    const out = g.serialize();
    expect(out).toContain('# TYPE pool_active gauge');
    expect(out).toContain('pool_active 6');
    expect(out).toContain('pool_active{db="main"} 11');
  });
});

describe('Histogram', () => {
  it('emite buckets cumulativos padrão de latência HTTP', () => {
    const h = new Histogram('http_ms');
    h.observe(3); // <=5
    h.observe(7); // <=10
    h.observe(120); // <=250
    h.observe(1000); // <=1000
    h.observe(5000); // <=5000
    h.observe(20000); // > 10000 (vai pro +Inf)

    const out = h.serialize();
    expect(out).toContain('# TYPE http_ms histogram');
    expect(out).toContain('http_ms_bucket{le="5"} 1');
    expect(out).toContain('http_ms_bucket{le="10"} 2');
    expect(out).toContain('http_ms_bucket{le="250"} 3');
    expect(out).toContain('http_ms_bucket{le="1000"} 4');
    expect(out).toContain('http_ms_bucket{le="5000"} 5');
    expect(out).toContain('http_ms_bucket{le="+Inf"} 6');
    expect(out).toContain('http_ms_count 6');
    // sum = 3+7+120+1000+5000+20000
    expect(out).toContain('http_ms_sum 26130');
  });

  it('rejeita buckets fora de ordem (duplicata ou decrescente)', () => {
    expect(() => new Histogram('foo', [5, 5])).toThrow(/crescentes/);
    expect(() => new Histogram('foo', [10, 5])).toThrow(/crescentes/);
  });

  it('emite slot vazio quando sem observações', () => {
    const h = new Histogram('empty_ms');
    const out = h.serialize();
    expect(out).toContain('# TYPE empty_ms histogram');
    expect(out).toContain('empty_ms_count 0');
    expect(out).toContain('empty_ms_sum 0');
  });

  it('separa observações por labels', () => {
    const h = new Histogram('ms');
    h.observe(50, { route: '/a' });
    h.observe(150, { route: '/a' });
    h.observe(500, { route: '/b' });

    expect(h.getCount({ route: '/a' })).toBe(2);
    expect(h.getSum({ route: '/a' })).toBe(200);
    expect(h.getCount({ route: '/b' })).toBe(1);
    expect(h.getSum({ route: '/b' })).toBe(500);
  });
});

describe('MetricsRegistry', () => {
  it('serializa todas as métricas no formato Prometheus 0.0.4', () => {
    const r = new MetricsRegistry();
    r.httpRequests.inc(1, { method: 'GET', route: '/x', status: '200' });
    r.httpDurationMs.observe(42, {
      method: 'GET',
      route: '/x',
      status: '200',
    });
    r.httpErrors.inc(1, { method: 'POST', route: '/y', status: '500' });
    r.prismaPoolActive.set(3);

    const out = r.serialize();
    expect(out).toContain('http_requests_total');
    expect(out).toContain('http_request_duration_ms');
    expect(out).toContain('http_request_errors_total');
    expect(out).toContain('prisma_pool_active_connections');
    // Verifica formato padrão
    expect(out).toMatch(/# TYPE \w+ (counter|gauge|histogram)/);
  });
});
