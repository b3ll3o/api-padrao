// TDD: src/shared/infrastructure/health/health.module.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-BOOT-001
import 'reflect-metadata';
import { HealthModule } from './health.module';

describe('HealthModule (estrutura)', () => {
  it('deve ter HealthController como controller', () => {
    const controllers = Reflect.getMetadata(
      'controllers',
      HealthModule,
    ) as any[];
    expect(controllers).toBeDefined();
    expect(controllers.length).toBe(1);
  });

  it('deve importar TerminusModule e HttpModule', () => {
    const imports = Reflect.getMetadata('imports', HealthModule) as any[];
    expect(imports).toBeDefined();
    expect(imports.length).toBe(3);
  });
});
