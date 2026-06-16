# Módulo de Empresas - Proposal

> Documentação retroativa de feature já implementada.
> Status: Aprovada e implementada.

## Overview

O módulo `empresas` é o pilar central do **modelo multi-tenant** da API `api-padrao`.
Ele provê o CRUD de entidades `Empresa`, faz a **vinculação N:M** entre `Usuario` e
`Empresa` (via tabela associativa `UsuarioEmpresa`) e suporta a atribuição de
`Perfil`s por vínculo. Toda autorização baseada em `@TemPermissao()` e o decorator
`@Auditar()` dependem de uma empresa válida como contexto de execução.

## Problem Statement

A API multi-tenant exige um catálogo de empresas (clientes/tenants) que:

- Seja gerenciado via endpoints HTTP com autenticação JWT e permissões granulares.
- Permita que um mesmo `Usuario` esteja vinculado a **múltiplas** `Empresa`s com
  perfis diferentes em cada uma.
- Aplique **soft-delete** (em vez de exclusão física) para preservar auditoria e
  integridade referencial dos vínculos.
- Exponha o vínculo `UsuarioEmpresa` para que o sistema de permissões consiga
  montar a claim `empresas[]` do JWT (`src/auth/...`).

## Motivation

- Habilitar a multi-tenancy como **requisito arquitetural transversal**.
- Sustentar a claim `empresas[]` no payload JWT (ver `src/auth/infrastructure/strategies/jwt.strategy.ts`).
- Sustentar a checagem de permissões via `@TemPermissao()` (decorator de `src/auth/...`)
  que consulta os perfis do usuário **dentro** da empresa do header `x-empresa-id`.
- Sustentar auditoria via `@Auditar({ recurso: 'EMPRESA' })` para trilhas
  de `CRIAR`, `ATUALIZAR` e `REMOVER`.

## Stakeholders

- [x] Administradores da plataforma (gerenciam catálogo de empresas-cliente).
- [x] Usuários finais (vinculados a uma ou mais empresas com perfis específicos).
- [x] Auditoria/Compliance (rastreabilidade de mudanças em empresas).
- [x] Sistema de autenticação (depende da estrutura `UsuarioEmpresa`).

## What Changes

Esta Change Request documenta a entrega retroativa da feature `empresas`,
incluindo:

- **7 endpoints HTTP** sob o path base `/empresas`:
  - `POST /empresas` (criar)
  - `GET /empresas` (listar paginado)
  - `GET /empresas/:id` (buscar por id)
  - `PATCH /empresas/:id` (atualizar)
  - `DELETE /empresas/:id` (soft-delete)
  - `POST /empresas/:id/usuarios` (vincular usuário)
  - `GET /empresas/:id/usuarios` (listar usuários vinculados)
- **7 códigos de permissão** novos: `CREATE_EMPRESA`, `READ_EMPRESAS`,
  `READ_EMPRESA_BY_ID`, `UPDATE_EMPRESA`, `DELETE_EMPRESA`,
  `ADD_USER_TO_EMPRESA`, `READ_EMPRESA_USUARIOS`.
- **Entidade de domínio** `Empresa` (UUID PK, `ativo`, `deletedAt`, `responsavelId`).
- **Repositório abstrato** `EmpresaRepository` (port) com 7 métodos.
- **Serviço de aplicação** `EmpresasService` (orquestra Empresa + Usuario + Perfil).
- **DTOs** validados com `class-validator`: `CreateEmpresaDto`, `UpdateEmpresaDto`,
  `AddUsuarioEmpresaDto`.
- **Camada de infraestrutura** `PrismaEmpresaRepository`.
- **Migration Prisma** com a tabela `empresa` e a tabela associativa `usuario_empresa`
  (relação N:M com perfis).
- **11 cenários BDD** em `features/empresas.feature`.
- **Suite E2E** em `test/empresas.e2e-spec.ts` com cobertura de segurança,
  autorização, casos de borda e cenários felizes.
- **Suite unitária** em `src/empresas/application/services/empresas.service.spec.ts`.

## Impact

- **Auth**: a claim `empresas[]` no JWT é construída a partir de `UsuarioEmpresa`
  e `Perfil` (ver `src/auth/application/services/auth.service.ts`).
- **Permissions**: a matriz de permissões ganha 7 entradas (seed + migrations).
- **Multi-tenancy**: o módulo é pré-requisito para `tenant-rate-limit`,
  `audit-module` e qualquer módulo com `@TemPermissao()`.
- **Database**: nova tabela `empresa`, tabela associativa `usuario_empresa`,
  e FKs em cascata para `perfil` e `usuario`.

## Initial Estimate

Já concluído. Esforço original estimado: 1 sprint (~5 dias úteis).
Trabalho de DDD → BDD → SDD → ATDD → TDD concluído conforme workflow em `AGENTS.md`.

## Risks

- **Risco 1 - Soft-delete órfão**: empresas inativadas ainda podem aparecer em
  JOINs se o consumidor não filtrar `ativo = true`. Mitigação: o repository
  aplica `ativo: true` por padrão em `findAll`, `findOne` e `findUsersByCompany`.
- **Risco 2 - Vínculo duplicado**: a chamada repetida de `POST /:id/usuarios`
  para o mesmo par `(empresa, usuario)` pode duplicar o `perfilIds` se o
  `addUserToCompany` não for idempotente. Mitigação: `upsert` na tabela
  `usuario_empresa` (validado pelo teste e2e
  `deve atualizar perfis se o vínculo já existir`).
- **Risco 3 - `responsavelId` inválido**: o DTO valida o tipo, mas não a
  existência. Mitigação: o DTO é apenas um contrato de entrada; a integridade
  referencial é imposta pelo FK Prisma em `migration`.
- **Risco 4 - Rate-limit**: criação/atualização/remoção são marcadas como
  `sensitive` (10 req/min) via `@Throttle({ sensitive: ... })`.

## Dependencies

- **Módulo `usuarios`**: `Usuario` é referenciado por `responsavelId` e por
  `UsuarioEmpresa.usuarioId`.
- **Módulo `perfis`**: `Perfil` é referenciado pela tabela associativa
  `UsuarioEmpresa` N:M.
- **Módulo `auth`**: depende de `empresas` para montar a claim `empresas[]` do JWT.
- **Módulo `prisma`**: provê o client usado por `PrismaEmpresaRepository`.
- **Módulo `shared/decorators`**: `@TemPermissao`, `@Auditar`, `@Throttle`,
  `@EmpresaId`, `@UsuarioLogado`.

## Alternatives Considered

- **Alternativa 1 - Hard-delete**: rejeitado por quebrar auditoria e
  integridade referencial de `UsuarioEmpresa` (que ainda referencia o histórico).
- **Alternativa 2 - Empresa implícita (singleton)**: rejeitado. Multi-tenancy
  explícita é o requisito; o JWT carrega a empresa atual no header
  `x-empresa-id`.
- **Alternativa 3 - Vínculo 1:N (um usuário → uma empresa)**: rejeitado. O
  requisito é N:M para suportar prestadores de serviço e consultores
  vinculados a múltiplos clientes.

## Status

- [ ] Draft
- [ ] Proposed
- [x] Approved
- [x] Implemented
- [x] Documented retroativamente
