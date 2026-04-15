Funcionalidade: Gerenciamento de Perfis

Eu como administrador do sistema
Quero gerenciar perfis de acesso
Para que eu possa controlar as permissões de cada perfil por empresa

Cenário: Criar perfil com dados válidos
  Dado que estou autenticado como administrador
  E existe empresa com ID "empresa-uuid-123"
  Quando eu enviar uma requisição POST para "/perfis" com:
    | nome | Administrador |
    | codigo | ADMIN |
    | descricao | Perfil com acesso total |
    | empresaId | empresa-uuid-123 |
  Então o status da resposta deve ser 201
  E a resposta deve conter o id do perfil criado
  E a resposta deve conter o código "ADMIN"

Cenário: Criar perfil sem código
  Dado que estou autenticado como administrador
  E existe empresa com ID "empresa-uuid-123"
  Quando eu enviar uma requisição POST para "/perfis" com:
    | nome | Leitor |
    | descricao | Perfil apenas para leitura |
    | empresaId | empresa-uuid-123 |
  Então o status da resposta deve ser 400

Cenário: Criar perfil sem empresa
  Dado que estou autenticado como administrador
  Quando eu enviar uma requisição POST para "/perfis" com:
    | nome | Leitor |
    | codigo | READER |
    | descricao | Perfil apenas para leitura |
  Então o status da resposta deve ser 400

Cenário: Criar perfil com código duplicado na mesma empresa
  Dado que existe perfil com código "ADMIN" na empresa "empresa-uuid-123"
  Quando eu enviar uma requisição POST para "/perfis" com:
    | nome | Admin 2 |
    | codigo | ADMIN |
    | empresaId | empresa-uuid-123 |
  Então o status da resposta deve ser 409

Cenário: Listar perfis por empresa
  Dado que existem perfis cadastrados para empresa "empresa-uuid-123"
  Quando eu enviar uma requisição GET para "/perfis?empresaId=empresa-uuid-123&page=1&limit=10"
  Então o status da resposta deve ser 200
  E a resposta deve conter perfis da empresa

Cenário: Buscar perfil por ID
  Dado que existe perfil com ID 1
  Quando eu enviar uma requisição GET para "/perfis/1"
  Então o status da resposta deve ser 200
  E a resposta deve conter o perfil com suas permissões

Cenário: Atualizar perfil
  Dado que existe perfil com ID 1
  Quando eu enviar uma requisição PATCH para "/perfis/1" com:
    | nome | Administrador Global |
  Então o status da resposta deve ser 200
  E a resposta deve conter o nome atualizado

Cenário: Associar permissões a um perfil
  Dado que existe perfil com ID 1
  E existem permissões com IDs 1, 2 e 3
  Quando eu enviar uma requisição POST para "/perfis/1/permissoes" com:
    | permissaoIds | [1, 2, 3] |
  Então o status da resposta deve ser 200
  E o perfil deve ter as permissões associadas

Cenário: Remover permissão de um perfil
  Dado que existe perfil com ID 1
  E o perfil tem permissão com ID 2 associada
  Quando eu enviar uma requisição DELETE para "/perfis/1/permissoes/2"
  Então o status da resposta deve ser 200
  E o perfil não deve mais ter a permissão 2

Cenário: Criar perfil sem permissões
  Dado que estou autenticado como administrador
  E existe empresa com ID "empresa-uuid-123"
  Quando eu enviar uma requisição POST para "/perfis" com:
    | nome | Básico |
    | codigo | BASIC |
    | descricao | Perfil básico sem permissões |
    | empresaId | empresa-uuid-123 |
  Então o status da resposta deve ser 201
  E o perfil deve ter lista vazia de permissões

Cenário: Buscar perfil por código na empresa
  Dado que existe perfil com código "ADMIN" na empresa "empresa-uuid-123"
  Quando eu enviar uma requisição GET para "/perfis/codigo/ADMIN?empresaId=empresa-uuid-123"
  Então o status da resposta deve ser 200
  E a resposta deve conter o perfil com código "ADMIN"