Funcionalidade: Gerenciamento de Permissões

Eu como administrador do sistema
Quero gerenciar permissões
Para que eu possa controlar quais ações cada perfil pode realizar

Cenário: Criar permissão com dados válidos
  Dado que estou autenticado como administrador
  Quando eu enviar uma requisição POST para "/permissoes" com:
    | nome | read:usuarios |
    | codigo | READ_USUARIOS |
    | descricao | Permite visualizar usuários |
  Então o status da resposta deve ser 201
  E a resposta deve conter o id da permissão criada
  E a resposta deve conter o código "READ_USUARIOS"

Cenário: Criar permissão sem código
  Dado que estou autenticado como administrador
  Quando eu enviar uma requisição POST para "/permissoes" com:
    | nome | write:usuarios |
    | descricao | Permite editar usuários |
  Então o status da resposta deve ser 400

Cenário: Criar permissão com código duplicado
  Dado que existe permissão com código "READ_USUARIOS"
  Quando eu enviar uma requisição POST para "/permissoes" com:
    | nome | read:usuarios-2 |
    | codigo | READ_USUARIOS |
    | descricao | Descrição duplicada |
  Então o status da resposta deve ser 409

Cenário: Listar permissões com paginação
  Dado que existem permissões cadastradas
  Quando eu enviar uma requisição GET para "/permissoes?page=1&limit=10"
  Então o status da resposta deve ser 200
  E a resposta deve conter "data" como array
  E a resposta deve conter "total"

Cenário: Buscar permissão por ID
  Dado que existe permissão com ID 1
  Quando eu enviar uma requisição GET para "/permissoes/1"
  Então o status da resposta deve ser 200
  E a resposta deve conter o id 1

Cenário: Buscar permissão por nome (contains, paginado)
  Dado que existe permissão com nome "READ_USUARIOS"
  Quando eu enviar uma requisição GET para "/permissoes/nome/READ_USUARIOS"
  Então o status da resposta deve ser 200
  E a resposta deve conter itens contendo "READ_USUARIOS"

Cenário: Buscar permissão por ID inexistente
  Quando eu enviar uma requisição GET para "/permissoes/9999"
  Então o status da resposta deve ser 404

Cenário: Atualizar permissão
  Dado que existe permissão com ID 1
  Quando eu enviar uma requisição PATCH para "/permissoes/1" com:
    | descricao | Descrição atualizada da permissão |
  Então o status da resposta deve ser 200
  E a resposta deve conter a descrição atualizada

Cenário: Criar permissão sem nome
  Dado que estou autenticado como administrador
  Quando eu enviar uma requisição POST para "/permissoes" com:
    | codigo | WRITE_EMPRESAS |
    | descricao | Permite criar empresas |
  Então o status da resposta deve ser 400

Cenário: Soft-delete de permissão (PATCH ativo=false) — soft-delete via @nestjs/terminus
  Dado que existe permissão com ID 1
  E esta permissão está associada a um perfil
  Quando eu enviar uma requisição PATCH para "/permissoes/1" com:
    | ativo | false |
  Então o status da resposta deve ser 200
  E o campo "ativo" da resposta deve ser false
  # Permissões associadas a perfis são soft-deletadas (não há DELETE físico)
  # Implementação: src/permissoes/application/services/permissoes.service.ts:174
  # REQ-PERM-018: soft-delete via PATCH /permissoes/:id {ativo: false}

# Cenário P3 removido de permissoes.feature — pertence a perfis.feature
# (Listar permissões por perfil está em /perfis/:id/permissoes, escopo de perfis)