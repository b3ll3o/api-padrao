// TDD: src/permissoes/permissoes.module.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-BOOT-001
//
// Testa APENAS que a classe PermissoesModule tem o decorator @Module
// corretamente aplicado e expõe o que deveria. A compilação completa
// do grafo de DI é responsabilidade do e2e (test/app.e2e-spec.ts).
import { PermissoesModule } from './permissoes.module';

describe('PermissoesModule (estrutura)', () => {
  it('deve ser uma classe decorada com @Module', () => {
    // Reflect.getMetadata para checar se o decorator @Module foi aplicado
    const meta = Reflect.getMetadata('imports', PermissoesModule) as any[];
    expect(Array.isArray(meta)).toBe(true);
    // PermissoesModule importa PrismaModule e AuthModule (via forwardRef)
    expect(meta.length).toBe(2);
  });

  it('deve exportar PermissoesService e PermissaoRepository', () => {
    const exports = Reflect.getMetadata('exports', PermissoesModule) as any[];
    expect(exports).toBeDefined();
    expect(exports.length).toBe(2);
  });

  it('deve registrar PermissoesController como controller', () => {
    const controllers = Reflect.getMetadata(
      'controllers',
      PermissoesModule,
    ) as any[];
    expect(controllers).toBeDefined();
    expect(controllers.length).toBe(1);
  });
});
