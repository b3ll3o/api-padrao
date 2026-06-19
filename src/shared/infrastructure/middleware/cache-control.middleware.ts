// BDD: features/devsecops-sprint1-quick-wins.feature:Funcionalidade: HTTP Hardening
// SDD: .openspec/changes/devsecops-sprint1-quick-wins/design.md#fase-1
// ATDD: test/http-hardening.e2e-spec.ts
// TDD: src/shared/infrastructure/middleware/cache-control.middleware.spec.ts
// [Sprint1-HTTP] Cache-Control: no-store em rotas sensíveis.
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class CacheControlMiddleware implements NestMiddleware {
  // Rotas onde responses podem conter dados sensíveis (PII, credenciais,
  // RBAC). Devem impedir cache em browser/proxies.
  // Ver CWE-525 (Use of Web Browser Cache Containing Sensitive Information).
  private static readonly SENSITIVE_PATHS: readonly RegExp[] = [
    /^\/auth(\/.*)?(\?.*)?$/,
    /^\/usuarios(\/.*)?(\?.*)?$/,
    /^\/empresas(\/.*)?(\?.*)?$/,
    /^\/perfis(\/.*)?(\?.*)?$/,
    /^\/permissoes(\/.*)?(\?.*)?$/,
  ];

  use(req: Request, res: Response, next: NextFunction): void {
    // Fastify exposes the full request path in `originalUrl`; `req.url` on a
    // Fastify request is the path relative to the route prefix (often just
    // '/'). Express middlewares migrated to Fastify commonly need this swap.
    // See https://docs.nestjs.com/techniques/middleware#middleware (Fastify).
    const url =
      (req as unknown as { originalUrl?: string }).originalUrl ??
      req.url ??
      '/';
    const isSensitive = CacheControlMiddleware.SENSITIVE_PATHS.some((rx) =>
      rx.test(url),
    );
    if (isSensitive) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  }
}
