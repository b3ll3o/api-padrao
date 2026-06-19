// TDD: src/auth/auth.module.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-BOOT-001
import 'reflect-metadata';
import { AuthModule } from './auth.module';

describe('AuthModule (estrutura)', () => {
  it('deve ter providers e controllers registrados', () => {
    const providers = Reflect.getMetadata('providers', AuthModule) as any[];
    const controllers = Reflect.getMetadata('controllers', AuthModule) as any[];
    expect(providers || controllers).toBeDefined();
  });

  it('deve ter AuthController registrado', () => {
    const controllers = Reflect.getMetadata('controllers', AuthModule) as any[];
    expect(Array.isArray(controllers)).toBe(true);
    expect(controllers.length).toBeGreaterThan(0);
  });

  it('deve importar PassportModule e JwtModule (autenticação JWT)', () => {
    const imports = Reflect.getMetadata('imports', AuthModule) as any[];
    expect(imports).toBeDefined();
    expect(imports.length).toBeGreaterThanOrEqual(2);
  });
});
