Funcionalidade: Recuperação de Senha

Eu como usuário do sistema
Quero recuperar minha senha esquecida via e-mail
Para que eu possa voltar a acessar a conta sem precisar contatar o suporte

Cenário: Solicitar recuperação com e-mail cadastrado
  Dado que existe usuário com e-mail "usuario@empresa.com"
  Quando eu enviar uma requisição POST para "/auth/forgot-password" com:
    | email | usuario@empresa.com |
  Então o status da resposta deve ser 202
  E um e-mail de recuperação é enviado para "usuario@empresa.com"
  E o corpo da resposta NÃO revela se o e-mail existe (anti-enumeração)

Cenário: Solicitar recuperação com e-mail não cadastrado
  Quando eu enviar uma requisição POST para "/auth/forgot-password" com:
    | email | inexistente@empresa.com |
  Então o status da resposta deve ser 202
  E nenhum e-mail é enviado
  E o corpo da resposta é idêntico ao caso de e-mail existente (anti-enumeração)

Cenário: Solicitar recuperação com e-mail inválido
  Quando eu enviar uma requisição POST para "/auth/forgot-password" com:
    | email | nao-eh-email |
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "E-mail inválido"

Esquema do Cenário: Token de recuperação tem validade limitada
  Dado que o usuário solicitou recuperação de senha em "2026-01-01T00:00:00Z"
  Quando o tempo corrente avança para <data_expiracao>
  Então o token de recuperação <resultado>

  Exemplos:
    | data_expiracao       | resultado       |
    | 2026-01-01T00:30:00Z | ainda é válido  |
    | 2026-01-01T01:00:01Z | está expirado   |
    | 2026-01-02T00:00:00Z | está expirado   |

Cenário: Resetar senha com token válido
  Dado que o usuário possui um token de recuperação válido
  Quando eu enviar uma requisição POST para "/auth/reset-password" com:
    | token | token-valido-aqui |
    | novaSenha | NovaSenha456! |
  Então o status da resposta deve ser 200
  E a senha do usuário é atualizada para o hash de "NovaSenha456!"
  E o token é invalidado (não pode ser reutilizado)
  E o usuário pode autenticar com a nova senha

Cenário: Resetar senha com token inválido
  Quando eu enviar uma requisição POST para "/auth/reset-password" com:
    | token | token-inexistente |
    | novaSenha | NovaSenha456! |
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "Token inválido"
  E nenhuma senha é alterada

Cenário: Resetar senha com token expirado
  Dado que o token de recuperação expirou há 1 hora
  Quando eu enviar uma requisição POST para "/auth/reset-password" com:
    | token | token-expirado |
    | novaSenha | NovaSenha456! |
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "Token expirado"
  E nenhuma senha é alterada

Esquema do Cenário: Nova senha deve atender política de segurança
  Quando eu enviar uma requisição POST para "/auth/reset-password" com:
    | token | token-valido |
    | novaSenha | <senha> |
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "<motivo>"

  Exemplos:
    | senha       | motivo                |
    |             | senha é obrigatória   |
    | 123         | mínimo 8 caracteres   |
    | semMaiuscula123! | maiúscula       |
    | SEMNUMERO!   | número                |
    | SemEspecial1 | caractere especial    |

Cenário: Reutilização do mesmo token é bloqueada
  Dado que o usuário já resetou a senha com sucesso usando o token
  Quando o usuário tentar usar o MESMO token novamente
  Então o status da resposta deve ser 400
  E o corpo da resposta deve conter "Token já utilizado"

Cenário: Após reset, sessão anterior é invalidada
  Dado que o usuário tinha refresh_tokens ativos antes do reset
  Quando o reset for concluído com sucesso
  Então todos os refresh_tokens anteriores são revogados
  E o usuário precisa fazer login novamente em outros dispositivos

Cenário: Bloqueio após múltiplas tentativas de reset inválidas
  Dado que o usuário já tentou resetar com tokens inválidos 5 vezes
  Quando o usuário tentar novamente
  Então o status da resposta deve ser 429
  E o corpo da resposta deve conter "Muitas tentativas"
  E novas tentativas são bloqueadas por 1 hora
