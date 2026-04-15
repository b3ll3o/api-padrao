# Workflow de Verificação de Alteração - Atualizado

## Overview

Atualização do workflow de verificação de alterações para incluir etapas de atualização de dependências e verificação de vulnerabilidades de segurança.

## Requirements

### Functional Requirements

- FR-01: Adicionar etapa de audit de segurança das dependências
- FR-02: Adicionar verificação de dependências desatualizadas
- FR-03: Incluir comando de update seguro de dependências
- FR-04: Manter validação existente (lint, build, test)

### Non-Functional Requirements

- NFR-01: Workflow deve ser rápido (dependency check não deve atrasar muito)
- NFR-02: Vulnerabilidades críticas devem bloquear o workflow

## Acceptance Criteria

- [ ] AC-01: `npm audit` executado como parte do workflow
- [ ] AC-02: `npm outdated` executado para identificar dependências desatualizadas
- [ ] AC-03: Comando `npm update` disponível para atualizar dependências
- [ ] AC-04: Vulnerabilidades críticas (severity: high/critical) bloqueiam o workflow
- [ ] AC-05: Todas as etapas existentes são preservadas

## Technical Notes

- Usar `npm audit --audit-level=high` para bloquear em vulnerabilidades high+
- Usar `npm outdated --json` para identificar outdated packages
- Adicionar script `npm run security:check` combinando audit e outdated
- Adicionar script `npm run deps:update` para update seguro
