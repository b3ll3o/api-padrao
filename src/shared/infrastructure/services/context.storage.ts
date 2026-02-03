import { AsyncLocalStorage } from 'async_hooks';

export interface IRequestContext {
  empresaId?: string;
  usuarioId?: number;
  requestId?: string;
}

export const contextStorage = new AsyncLocalStorage<IRequestContext>();
