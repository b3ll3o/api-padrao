// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/shared/domain/services/password-hasher.service.spec.ts

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract compare(password: string, hash: string): Promise<boolean>;
}
