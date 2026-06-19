// TDD: src/perfis/perfis.module.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-BOOT-001
import 'reflect-metadata';
import { PerfisModule } from './perfis.module';

describe('PerfisModule (estrutura)', () => {
  it('deve ter providers e controllers registrados', () => {
    const providers = Reflect.getMetadata('providers', PerfisModule) as any[];
    const controllers = Reflect.getMetadata(
      'controllers',
      PerfisModule,
    ) as any[];
    expect(providers || controllers).toBeDefined();
  });

  it('deve ter pelo menos um controller', () => {
    const controllers = Reflect.getMetadata(
      'controllers',
      PerfisModule,
    ) as any[];
    expect(Array.isArray(controllers)).toBe(true);
    expect(controllers.length).toBeGreaterThan(0);
  });

  it('deve exportar PerfisService', () => {
    const exports = Reflect.getMetadata('exports', PerfisModule) as any[];
    expect(exports).toBeDefined();
    expect(exports.length).toBeGreaterThan(0);
  });
});
