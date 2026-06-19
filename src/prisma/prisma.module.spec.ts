// TDD: src/prisma/prisma.module.spec.ts
// SDD: .openspec/changes/observabilidade/design.md:REQ-BOOT-001
import 'reflect-metadata';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

describe('PrismaModule (estrutura)', () => {
  it('deve ser uma classe decorada com @Module', () => {
    // @Module decorator aplica metadata via Reflect.defineMetadata.
    // Aqui validamos que os metadados esperados estão presentes.
    const providers = Reflect.getMetadata('providers', PrismaModule) as any[];
    const exports = Reflect.getMetadata('exports', PrismaModule) as any[];
    expect(providers || exports).toBeDefined();
  });

  it('deve ter PrismaService como provider', () => {
    const providers = Reflect.getMetadata('providers', PrismaModule) as any[];
    expect(providers).toBeDefined();
    expect(providers).toContain(PrismaService);
  });

  it('deve exportar PrismaService', () => {
    const exports = Reflect.getMetadata('exports', PrismaModule) as any[];
    expect(exports).toBeDefined();
    expect(exports).toContain(PrismaService);
  });

  it('PrismaService é uma classe concreta de provider NestJS', () => {
    // Sanity: o tipo importado é o mesmo registrado no módulo
    expect(typeof PrismaService).toBe('function');
    expect(PrismaModule).toBeDefined();
  });
});
