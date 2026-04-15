Funcionalidade: Gerenciamento de Empresas

Eu como administrador do sistema
Quero gerenciar empresas
Para que eu possa manter o cadastro de empresas clientes

Cenário: Criar empresa com dados válidos
  Dado que estou autenticado como administrador
  Quando eu enviar uma requisição POST para "/empresas" com:
    | nome | Empresa Teste Ltda |
    | descricao | Empresa de tecnologia |
    | responsavelId | 1 |
  Então o status da resposta deve ser 201
  E a resposta deve conter o id da empresa criada
  E a resposta deve conter o nome "Empresa Teste Ltda"

Cenário: Criar empresa sem nome
  Dado que estou autenticado como administrador
  Quando eu enviar uma requisição POST para "/empresas" com:
    | responsavelId | 1 |
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "O nome é obrigatório"

Cenário: Criar empresa sem responsável
  Dado que estou autenticado como administrador
  Quando eu enviar uma requisição POST para "/empresas" com:
    | nome | Empresa Teste |
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "O ID do responsável é obrigatório"

Cenário: Listar empresas com paginação
  Dado que existem empresas cadastradas
  Quando eu enviar uma requisição GET para "/empresas?page=1&limit=10"
  Então o status da resposta deve ser 200
  E a resposta deve conter "data" como array
  E a resposta deve conter "total" maior ou igual a 0
  E a resposta deve conter "page" igual a 1

Cenário: Buscar empresa por ID existente
  Dado que existe empresa com ID "empresa-uuid-123"
  Quando eu enviar uma requisição GET para "/empresas/empresa-uuid-123"
  Então o status da resposta deve ser 200
  E a resposta deve conter o id "empresa-uuid-123"

Cenário: Buscar empresa por ID inexistente
  Quando eu enviar uma requisição GET para "/empresas/id-inexistente"
  Então o status da resposta deve ser 404
  E o corpo da resposta deve conter "não encontrada"

Cenário: Atualizar empresa existente
  Dado que existe empresa com ID "empresa-uuid-123"
  Quando eu enviar uma requisição PATCH para "/empresas/empresa-uuid-123" com:
    | nome | Empresa Atualizada |
  Então o status da resposta deve ser 200
  E a resposta deve conter o nome "Empresa Atualizada"

Cenário: Atualizar empresa inexistente
  Quando eu enviar uma requisição PATCH para "/empresas/id-inexistente" com:
    | nome | Empresa Nova |
  Então o status da resposta deve ser 404

Cenário: Remover empresa (soft-delete)
  Dado que existe empresa com ID "empresa-uuid-123"
  Quando eu enviar uma requisição DELETE para "/empresas/empresa-uuid-123"
  Então o status da resposta deve ser 200
  E a empresa não deve mais aparecer na listagem ativa

Cenário: Adicionar usuário à empresa
  Dado que existe empresa com ID "empresa-uuid-123"
  E existe usuário com ID 5
  E existem perfis com IDs 1 e 2
  Quando eu enviar uma requisição POST para "/empresas/empresa-uuid-123/usuarios" com:
    | usuarioId | 5 |
    | perfilIds | [1, 2] |
  Então o status da resposta deve ser 200
  E o usuário 5 deve estar associado à empresa com perfis 1 e 2

Cenário: Adicionar usuário inexistente à empresa
  Dado que existe empresa com ID "empresa-uuid-123"
  Quando eu enviar uma requisição POST para "/empresas/empresa-uuid-123/usuarios" com:
    | usuarioId | 9999 |
    | perfilIds | [1] |
  Então o status da resposta deve ser 404
  E o corpo da resposta deve conter "não encontrado"

Cenário: Listar usuários de uma empresa
  Dado que existe empresa com ID "empresa-uuid-123"
  E a empresa tem usuários associados
  Quando eu enviar uma requisição GET para "/empresas/empresa-uuid-123/usuarios?page=1&limit=10"
  Então o status da resposta deve ser 200
  E a resposta deve conter lista de usuários