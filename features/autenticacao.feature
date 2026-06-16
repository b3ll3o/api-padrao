Funcionalidade: Autenticação de Usuário

Eu como usuário do sistema
Quero me autenticar com e-mail e senha
Para que eu possa acessar as funcionalidades protegidas

Cenário: Login com credenciais válidas
  Dado que o usuário está cadastrado com e-mail "usuario@empresa.com" e senha "Password123!"
  Quando eu enviar uma requisição POST para "/auth/login" com:
    | email | usuario@empresa.com |
    | senha | Password123! |
  Então o status da resposta deve ser 201
  E o corpo da resposta deve conter "access_token"
  E o corpo da resposta deve conter "refresh_token"

Cenário: Login com credenciais inválidas - senha incorreta
  Dado que o usuário está cadastrado com e-mail "usuario@empresa.com" e senha "Password123!"
  Quando eu enviar uma requisição POST para "/auth/login" com:
    | email | usuario@empresa.com |
    | senha | SenhaErrada456! |
  Então o status da resposta deve ser 401
  E o corpo da resposta deve conter "Credenciais inválidas"

Cenário: Login com e-mail não cadastrado
  Quando eu enviar uma requisição POST para "/auth/login" com:
    | email | naoexiste@empresa.com |
    | senha | Password123! |
  Então o status da resposta deve ser 401
  E o corpo da resposta deve conter "Credenciais inválidas"

Cenário: Login com e-mail inválido
  Quando eu enviar uma requisição POST para "/auth/login" com:
    | email | email-invalido |
    | senha | Password123! |
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "E-mail inválido"

Cenário: Login com senha curta
  Quando eu enviar uma requisição POST para "/auth/login" com:
    | email | usuario@empresa.com |
    | senha | Curta1 |
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "no mínimo 8 caracteres"

Cenário: Refresh token válido
  Dado que o usuário está autenticado com um refresh_token válido
  Quando eu enviar uma requisição POST para "/auth/refresh" com o refresh_token
  Então o status da resposta deve ser 201
  E o corpo da resposta deve conter novos "access_token" e "refresh_token"

Cenário: Refresh token expirado
  Dado que o usuário possui um refresh_token expirado
  Quando eu enviar uma requisição POST para "/auth/refresh" com o refresh_token expirado
  Então o status da resposta deve ser 401
  E o corpo da resposta deve conter "expirado"

Cenário: Refresh token inválido
  Quando eu enviar uma requisição POST para "/auth/refresh" com "token-invalido"
  Então o status da resposta deve ser 401
  E o corpo da resposta deve conter "inválido"

Cenário: Login sem credenciais
  Quando eu enviar uma requisição POST para "/auth/login" com body vazio
  Então o status da resposta deve ser 400

Cenário: Solicitar recuperação de senha com e-mail válido
  Quando eu enviar uma requisição POST para "/auth/forgot-password" com:
    | email | usuario@empresa.com |
  Então o status da resposta deve ser 200

Cenário: Solicitar recuperação de senha com e-mail inexistente
  Quando eu enviar uma requisição POST para "/auth/forgot-password" com:
    | email | naoexiste@empresa.com |
  Então o status da resposta deve ser 200

Cenário: Resetar senha com token válido
  Dado que existe um token de reset válido para "usuario@empresa.com"
  Quando eu enviar uma requisição POST para "/auth/reset-password" com:
    | token | TOKEN_VALIDO |
    | novaSenha | NovaSenha123! |
  Então o status da resposta deve ser 200

Cenário: Resetar senha com token expirado
  Dado que existe um token de reset expirado
  Quando eu enviar uma requisição POST para "/auth/reset-password" com:
    | token | TOKEN_EXPIRADO |
    | novaSenha | NovaSenha123! |
  Então o status da resposta deve ser 401

Cenário: Resetar senha com token já utilizado
  Dado que existe um token de reset já utilizado
  Quando eu enviar uma requisição POST para "/auth/reset-password" com:
    | token | TOKEN_USADO |
    | novaSenha | NovaSenha123! |
  Então o status da resposta deve ser 401