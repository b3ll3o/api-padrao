import { Injectable } from '@nestjs/common';
import { contextStorage } from './context.storage';

@Injectable()
export class EmpresaContext {
  set empresaId(id: string) {
    const store = contextStorage.getStore();
    if (store) {
      store.empresaId = id;
    }
  }

  get empresaId(): string {
    const store = contextStorage.getStore();
    if (!store?.empresaId) {
      throw new Error('Contexto de empresa não definido');
    }
    return store.empresaId;
  }

  set usuarioId(id: number) {
    const store = contextStorage.getStore();
    if (store) {
      store.usuarioId = id;
    }
  }

  get usuarioId(): number {
    const store = contextStorage.getStore();
    if (!store?.usuarioId) {
      throw new Error('Contexto de usuário não definido');
    }
    return store.usuarioId;
  }

  possuiEmpresa(): boolean {
    return contextStorage.getStore()?.empresaId !== undefined;
  }
}
