// TDD: src/shared/shared.module.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-BOOT-001
import 'reflect-metadata';
import { SharedModule } from './shared.module';

describe('SharedModule (estrutura)', () => {
  it('deve ter providers registrados', () => {
    const providers = Reflect.getMetadata('providers', SharedModule) as any[];
    expect(providers).toBeDefined();
    expect(providers.length).toBeGreaterThan(0);
  });

  it('deve ter imports registrados', () => {
    const imports = Reflect.getMetadata('imports', SharedModule) as any[];
    expect(imports).toBeDefined();
  });

  it('SharedModule é a classe correta (compilação OK)', () => {
    expect(SharedModule).toBeDefined();
    expect(typeof SharedModule).toBe('function');
  });
});
