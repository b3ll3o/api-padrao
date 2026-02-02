import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class EmpresaContext {
  private _empresaId: string | null = null;
  private _usuarioId: number | null = null;

  set empresaId(id: string) {
    this._empresaId = id;
  }

  get empresaId(): string {
    if (!this._empresaId) {
      throw new Error('Contexto de empresa não definido');
    }
    return this._empresaId;
  }

  set usuarioId(id: number) {
    this._usuarioId = id;
  }

  get usuarioId(): number {
    if (!this._usuarioId) {
      throw new Error('Contexto de usuário não definido');
    }
    return this._usuarioId;
  }

  possuiEmpresa(): boolean {
    return this._empresaId !== null;
  }
}
