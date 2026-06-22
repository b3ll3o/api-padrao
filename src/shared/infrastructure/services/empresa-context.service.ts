// BDD: N/A (cross-cutting / infraestrutura)
// SDD: N/A
// TDD: src/shared/infrastructure/services/empresa-context.service.spec.ts

import { Injectable, Logger } from '@nestjs/common';
import { contextStorage } from './context.storage';

// Prisma `Empresa.id @default(uuid())` gera UUID v4 (RFC 4122):
//   xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
// A regex abaixo cobre o formato canônico (com ou sem hifens normalizados
// pelo case-insensitive flag) e rejeita explicitamente outras versões.
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class EmpresaContext {
  private static readonly logger = new Logger(EmpresaContext.name);

  set empresaId(id: string | undefined) {
    // Strings vazias e `undefined` representam "sem tenant" (rotas públicas
    // / clear de contexto) e são aceitas — apenas valores não-vazios
    // precisam estar em conformidade com UUID v4.
    if (id !== undefined && id !== '' && !UUID_V4_REGEX.test(id)) {
      EmpresaContext.logger.warn(
        `empresaId inválido ignorado (esperado UUID v4): ${id}`,
      );
      return;
    }
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
