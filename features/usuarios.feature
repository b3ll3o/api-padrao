Funcionalidade: Gerenciamento de Usuários

Eu como administrador do sistema
Quero gerenciar usuários
Para que eu possa manter o cadastro de usuários do sistema

Cenário: Criar usuário com dados válidos
  Dado que estou autenticado como administrador
  Quando eu enviar uma requisição POST para "/usuarios" com:
    | email | novo.usuario@empresa.com |
    | senha | Password123! |
  Então o status da resposta deve ser 201
  E a resposta deve conter o id do usuário criado
  E a resposta deve conter o email "novo.usuario@empresa.com"
  E a senha não deve ser retornada na resposta

Cenário: Criar usuário com e-mail já existente
  Dado que existe usuário com e-mail "usuario@empresa.com"
  Quando eu enviar uma requisição POST para "/usuarios" com:
    | email | usuario@empresa.com |
    | senha | Password123! |
  Então o status da resposta deve ser 409
  E o corpo da resposta deve conter "já existe"

Cenário: Criar usuário com e-mail inválido
  Dado que estou autenticado como administrador
  Quando eu enviar uma requisição POST para "/usuarios" com:
    | email | email-nao-valido |
    | senha | Password123! |
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "E-mail inválido"

Cenário: Criar usuário com senha fraca - sem maiúscula
  Dado que estou autenticado como administrador
  Quando eu enviar uma requisição POST para "/usuarios" com:
    | email | usuario@empresa.com |
    | senha | password123! |
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "maiúscula"

Cenário: Criar usuário com senha curta
  Dado que estou autenticado como administrador
  Quando eu enviar uma requisição POST para "/usuarios" com:
    | email | usuario@empresa.com |
    | senha | Curta1 |
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "mínimo 8 caracteres"

Cenário: Listar usuários com paginação
  Dado que existem usuários cadastrados
  Quando eu enviar uma requisição GET para "/usuarios?page=1&limit=10"
  Então o status da resposta deve ser 200
  E a resposta deve conter "data" como array
  E a resposta deve conter "total"

Cenário: Buscar usuário por ID existente
  Dado que existe usuário com ID 1
  Quando eu enviar uma requisição GET para "/usuarios/1"
  Então o status da resposta deve ser 200
  E a resposta deve conter o id 1
  E a senha não deve ser retornada

Cenário: Buscar usuário por ID inexistente
  Quando eu enviar uma requisição GET para "/usuarios/9999"
  Então o status da resposta deve ser 404

Cenário: Atualizar e-mail de usuário
  Dado que existe usuário com ID 1
  Quando eu enviar uma requisição PATCH para "/usuarios/1" com:
    | email | novo.email@empresa.com |
  Então o status da resposta deve ser 200
  E a resposta deve conter o email "novo.email@empresa.com"

Cenário: Atualizar senha de usuário
  Dado que existe usuário com ID 1
  Quando eu enviar uma requisição PATCH para "/usuarios/1" com:
    | senha | NovaSenha123! |
  Então o status da resposta deve ser 200

Cenário: Desativar usuário (soft-delete)
  Dado que existe usuário com ID 1
  Quando eu enviar uma requisição PATCH para "/usuarios/1" com:
    | ativo | false |
  Então o status da resposta deve ser 200
  E o usuário não deve aparecer na listagem ativa

Cenário: Reativar usuário
  Dado que existe usuário desativado com ID 1
  Quando eu enviar uma requisição PATCH para "/usuarios/1" com:
    | ativo | true |
  Então o status da resposta deve ser 200
  E o usuário deve aparecer na listagem ativa

Cenário: Usuário não-admin não pode listar usuários
  Dado que existe usuário não-admin logado
  Quando eu enviar uma requisição GET para "/usuarios?page=1&limit=10"
  Então o status da resposta deve ser 403
  E o corpo da resposta deve conter "Forbidden"
# ============================================================
# Rate Limit por Tenant (US-NF-001)
# Feature: tenant-rate-limit
# Source: .openspec/changes/tenant-rate-limit/{proposal,design,tasks}.md
# ============================================================

Cenário: Rate limit por tenant — FREE bloqueia em 100 req/min
  Dado que existe uma empresa com plano "FREE"
  Quando eu enviar 101 requisições GET para "/usuarios" no intervalo de 1 minuto
  Então a 101ª resposta deve ter status 429

Cenário: Rate limit por tenant — PRO permite 1000 req/min
  Dado que existe uma empresa com plano "PRO"
  Quando eu enviar 100 requisições GET para "/usuarios" no intervalo de 1 minuto
  Então todas as 100 respostas devem ter status 200

Cenário: Rate limit respeita empresaId do JWT
  Dado que existem duas empresas com plano "FREE"
  Quando eu enviar 100 requisições da Empresa A e 100 requisições da Empresa B
  Então ambas devem ter status 200 (contadores independentes)
