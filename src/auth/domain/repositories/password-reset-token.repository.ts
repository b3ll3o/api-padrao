/**
 * Porta (Hexagonal) para operações em `PasswordResetToken`.
 *
 * Centraliza lookup/hash/marcação de uso de tokens de reset, para que o
 * `PasswordRecoveryService` (camada Application) não dependa de
 * `PrismaService` diretamente. Após [Cleanup Sprint 2], o service
 * depende apenas desta abstração — DIP respeitado.
 *
 * @see src/auth/infrastructure/repositories/prisma-password-reset-token.repository.ts
 *      Implementação concreta (Prisma) — única `useClass` injetada.
 */
// BDD: features/autenticacao.feature:Funcionalidade: Recuperação de Senha
// SDD: .openspec/changes/password-recovery/design.md:REQ-PR-002,REQ-PR-003,REQ-PR-005
export interface PasswordResetTokenRecord {
  id: string;
  tokenHash: string;
  userId: number;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface PasswordResetTokenCreateInput {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}

export abstract class PasswordResetTokenRepository {
  /**
   * Cria um novo `PasswordResetToken` com `tokenHash` já calculado.
   * O plain token **nunca** deve ser persistido.
   */
  abstract create(
    data: PasswordResetTokenCreateInput,
  ): Promise<PasswordResetTokenRecord>;

  /**
   * Busca um token pelo `tokenHash` se (a) **não usado** e (b) **não expirado**.
   * Retorna `null` caso não satisfaça ambos os critérios — caller decide
   * se o motivo da rejeição é "expirado", "usado" ou "inválido".
   */
  abstract findValidByHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenRecord | null>;

  /**
   * Invalida todos os tokens ainda não usados do usuário.
   * Chamado antes de emitir um novo token (cascade — REQ-PR-005).
   */
  abstract invalidateAllForUser(userId: number): Promise<void>;
}
