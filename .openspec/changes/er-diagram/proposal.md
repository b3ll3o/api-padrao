# Proposal — ER Diagram em AGENTS.md (SUG-001)

## Why

SUG-001 do relatório de varredura da documentação: o `AGENTS.md` (fonte canônica de arquitetura) não contém um diagrama Entidade-Relacionamento (ER) do modelo de dados. A §4 descreve conceitos (multi-tenancy, soft delete, tabelas transversais) em texto corrido, mas a visão de conjunto das 9 entidades e seus relacionamentos está dispersa entre `prisma/schema.prisma` e este documento.

Adicionar um diagrama ER em Mermaid na §4:

- Melhora a compreensão visual do modelo multi-tenant para novos contribuidores e agentes IA.
- Centraliza o conhecimento do schema (que hoje exige ler `prisma/schema.prisma` linha por linha).
- Reforça a posição do `AGENTS.md` como **fonte de verdade única** de arquitetura.
- Inclui a nova entidade `PasswordResetToken`, recentemente adicionada ao schema.

## What Changes

- Adiciona **1 bloco `mermaid` (diagrama ER)** à seção `## 4. Arquitetura` do `AGENTS.md`.
- Posiciona o diagrama logo após o parágrafo que descreve a multi-tenancy (após a subseção "Multi-tenancy (escopo central da aplicação)") e antes de "Soft delete" / "Modelos de dados transversais" (que descrevem as tabelas transversais individualmente).
- O diagrama inclui todas as 9 entidades do `prisma/schema.prisma`:
  1. `Usuario`
  2. `Empresa`
  3. `UsuarioEmpresa` (tabela de junção N:M)
  4. `Perfil`
  5. `Permissao`
  6. `RefreshToken`
  7. `PasswordResetToken`
  8. `LoginHistory`
  9. `AuditLog`
- Cardinalidades usadas: `||--o{` (1:N obrigatório), `}o--o{` (N:M), `}o--||` (N:1 opcional).
- Atributos principais: PK, FK, campos únicos, timestamps de auditoria e soft delete.

## Impact

- **Escopo**: apenas o arquivo `AGENTS.md` é modificado.
- **Risco de runtime**: zero. Documentação é renderizada estaticamente.
- **Compatibilidade**: blocos `mermaid` são suportados nativamente pelo GitHub Markdown, GitLab, VS Code e pela maioria dos visualizadores Markdown.
- **Verificação**: o bloco será validado por inspeção visual no GitHub após merge.

## Risks

- **Nenhum risco funcional.** Mudança puramente documental.
- Único risco teórico: sintaxe Mermaid inválida, mitigada pela revisão visual do bloco antes do commit.

## Out of Scope

- Não altera `prisma/schema.prisma`.
- Não cria novos módulos, endpoints ou migrations.
- Não altera o `README.md` (o link para `AGENTS.md` já existe e continua válido).

## Acceptance Criteria

- [x] Arquivo `.openspec/changes/er-diagram/proposal.md` criado.
- [ ] Bloco `mermaid` adicionado ao `AGENTS.md` na posição especificada.
- [ ] Diagrama inclui as 9 entidades e seus relacionamentos.
- [ ] Diagrama renderiza corretamente (validação visual no GitHub).
