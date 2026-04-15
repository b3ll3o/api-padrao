# SDD + ATDD Implementation Specification

## Overview

Implementação completa dos paradigmas SDD (Specification-Driven Development) e ATDD (Acceptance Test-Driven Development) neste projeto, seguindo o PRD do OpenCode.

## Current State Analysis

- AGENTS.md com SDD básico ✓
- opencode.json com modes ✓
- .openspec/ estrutura básica ✓

## Requirements

### Functional Requirements

- FR-01: Atualizar AGENTS.md com regras SDD + ATDD completas
- FR-02: Criar workflow SDD com etapas de propose → spec → tasks → tests → apply → verify → archive
- FR-03: Adicionar estrutura de change com proposal.md, design.md, tasks.md
- FR-04: Documentar como escrever testes de aceitação (ATDD)
- FR-05: Adicionar comandos de validação SDD

### Non-Functional Requirements

- NFR-01: Manter simplicidade - nãoover-engineering
- NFR-02: Manter compatibilidade com scripts existentes (npm run validate, etc)

## Acceptance Criteria

- [ ] AC-01: AGENTS.md menciona explicitamente SDD + ATDD
- [ ] AC-02: Fluxo de 7 etapas documentado
- [ ] AC-03: Estrutura .openspec/changes/<feature>/ com arquivos corretos
- [ ] AC-04: Testes de aceitação são requisitos antes da implementação

## Technical Notes

- ATDD: Escrever testes de aceitação ANTES da implementação
- Usar Jest com descrições em linguagem natural
- Localização: `src/**/*.acceptance.spec.ts` ou `test/acceptance/`
