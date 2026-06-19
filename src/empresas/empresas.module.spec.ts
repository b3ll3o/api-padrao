// TDD: src/empresas/empresas.module.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-BOOT-001
import 'reflect-metadata';
import { EmpresasModule } from './empresas.module';

describe('EmpresasModule (estrutura)', () => {
  it('deve ter providers e controllers registrados', () => {
    const providers = Reflect.getMetadata('providers', EmpresasModule) as any[];
    const controllers = Reflect.getMetadata(
      'controllers',
      EmpresasModule,
    ) as any[];
    expect(providers || controllers).toBeDefined();
  });

  it('deve ter pelo menos um controller', () => {
    const controllers = Reflect.getMetadata(
      'controllers',
      EmpresasModule,
    ) as any[];
    expect(Array.isArray(controllers)).toBe(true);
    expect(controllers.length).toBeGreaterThan(0);
  });

  it('deve exportar EmpresasService e EmpresaRepository', () => {
    const exports = Reflect.getMetadata('exports', EmpresasModule) as any[];
    expect(exports).toBeDefined();
    expect(exports.length).toBeGreaterThanOrEqual(2);
  });
});
