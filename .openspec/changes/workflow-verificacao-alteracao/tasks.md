# Tasks: Workflow de Verificação de Alteração

## Tasks

### 1. Adicionar scripts de segurança no package.json

- [ ] Adicionar script `security:check` com `npm audit --audit-level=high`
- [ ] Adicionar script `deps:check` com `npm outdated`
- [ ] Adicionar script `deps:update` com `npm update`

### 2. Atualizar workflow verificacao-alteracao.md

- [ ] Adicionar etapa de verificação de segurança (após passo 1)
- [ ] Adicionar etapa de check de dependências desatualizadas
- [ ] Documentar novos scripts disponíveis

### 3. Validar alterações

- [ ] Executar `npm run validate` completo
- [ ] Verificar que novos scripts funcionam
