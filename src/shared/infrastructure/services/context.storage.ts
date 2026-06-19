// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/shared/infrastructure/services/context.storage.spec.ts

import { AsyncLocalStorage } from 'async_hooks';

export interface IRequestContext {
  empresaId?: string;
  usuarioId?: number;
  requestId?: string;
}

export const contextStorage = new AsyncLocalStorage<IRequestContext>();
