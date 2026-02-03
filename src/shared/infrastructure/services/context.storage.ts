import { AsyncLocalStorage } from 'async_hooks';

export interface IRequestContext {
  empresaId?: string;
  usuarioId?: number;
}

export const contextStorage = new AsyncLocalStorage<IRequestContext>();
