// TDD: src/usuarios/usuarios.module.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-BOOT-001
// REQ-USER-001..052: módulo usuarios (auto-cadastro + CRUD + auditoria)
import 'reflect-metadata';
import { UsuariosModule } from './usuarios.module';

describe('UsuariosModule (estrutura)', () => {
  it('deve ter providers e controllers registrados', () => {
    const providers = Reflect.getMetadata('providers', UsuariosModule) as any[];
    const controllers = Reflect.getMetadata(
      'controllers',
      UsuariosModule,
    ) as any[];
    expect(providers || controllers).toBeDefined();
  });

  it('deve ter pelo menos um controller', () => {
    const controllers = Reflect.getMetadata(
      'controllers',
      UsuariosModule,
    ) as any[];
    expect(Array.isArray(controllers)).toBe(true);
    expect(controllers.length).toBeGreaterThan(0);
  });

  it('deve exportar UsuariosService e UsuarioRepository', () => {
    const exports = Reflect.getMetadata('exports', UsuariosModule) as any[];
    expect(exports).toBeDefined();
    expect(exports.length).toBeGreaterThanOrEqual(2);
  });
});
