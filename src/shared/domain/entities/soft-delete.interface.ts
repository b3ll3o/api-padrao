// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/shared/domain/entities/soft-delete.interface.spec.ts

export interface ISoftDelete {
  deletedAt?: Date | null;
  ativo: boolean;
}
