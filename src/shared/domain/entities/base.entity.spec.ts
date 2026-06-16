import { BaseEntity } from './base.entity';

// TDD: AGENTS.md §4 — BaseEntity define contrato soft-delete para todas entities
//      Se BaseEntity mudar (ex.: adicionar campo), todas entities herdam.

// Concretiza BaseEntity para testar (é abstrata)
class TestEntity extends BaseEntity {
  nome: string;
  constructor(partial: Partial<TestEntity> = {}) {
    super();
    Object.assign(this, partial);
  }
}

describe('BaseEntity', () => {
  it('deve fornecer id, createdAt, updatedAt, deletedAt, ativo', () => {
    const e = new TestEntity({
      id: 1,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-02'),
      deletedAt: null,
      ativo: true,
      nome: 'Teste',
    });

    expect(e.id).toBe(1);
    expect(e.createdAt).toBeInstanceOf(Date);
    expect(e.updatedAt).toBeInstanceOf(Date);
    expect(e.deletedAt).toBeNull();
    expect(e.ativo).toBe(true);
    expect(e.nome).toBe('Teste');
  });

  it('deletedAt deve aceitar Date (soft-deletado) ou null (ativo)', () => {
    const ativo = new TestEntity({ deletedAt: null });
    const deletado = new TestEntity({ deletedAt: new Date() });

    expect(ativo.deletedAt).toBeNull();
    expect(deletado.deletedAt).toBeInstanceOf(Date);
  });

  it('deve implementar ISoftDelete (deletedAt?: Date | null, ativo: boolean)', () => {
    const e = new TestEntity({ deletedAt: null, ativo: true });
    // Compilação TypeScript já valida; em runtime verificamos a forma
    expect('deletedAt' in e).toBe(true);
    expect('ativo' in e).toBe(true);
  });

  it('campos são mutáveis (entities são anêmicas neste projeto)', () => {
    const e = new TestEntity({ ativo: true });
    e.ativo = false;
    e.deletedAt = new Date();
    expect(e.ativo).toBe(false);
    expect(e.deletedAt).toBeInstanceOf(Date);
  });
});
