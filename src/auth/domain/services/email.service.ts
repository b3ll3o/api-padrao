// BDD: features/autenticacao.feature
// SDD: .openspec/changes/auth/design.md
// ATDD: test/auth.e2e-spec.ts
// TDD: src/auth/domain/services/email.service.spec.ts

/**
 * @deprecated Este arquivo será removido. Use `src/shared/domain/services/email.service`.
 * Mantido como re-export para compatibilidade com imports legados.
 */
export {
  EMAIL_SERVICE,
  EmailService,
  EmailMessage,
} from '../../../shared/domain/services/email.service';
