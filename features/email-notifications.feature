# language: pt
# BDD: features/email-notifications.feature
# SDD: .openspec/changes/email-notifications/design.md
# ATDD: test/email-notifications.e2e-spec.ts
# TDD: src/shared/application/services/email-sender.service.spec.ts
#      src/shared/infrastructure/services/{logger-email,template-loader}.service.spec.ts
#      src/{auth,usuarios,empresas}/application/services/*spec.ts (estendidos)
#
# Cobertura:
#   REQ-EM-01 (password_reset)            — Cenário: auth.password_reset
#   REQ-EM-02 (welcome)                   — Cenário: usuarios.welcome
#   REQ-EM-03 (password_changed)          — Cenário: usuarios.password_changed
#   REQ-EM-04 (user_added)                — Cenário: empresas.user_added
#   REQ-EM-05 (account_disabled)          — Cenário: usuarios.account_disabled
#   REQ-EM-06 (anti-enumeração)           — Cenário: anti-enumeração preservada
#   REQ-EM-07 (não bloqueia)              — Cenário: falha não bloqueia request
#   REQ-EM-08 (templates versionados)     — Cenário: template ausente aborta boot
#   REQ-EM-09 (renderer placeholders)     — Cenário: renderer substitui placeholders
#   REQ-EM-10 (templateId whitelist)      — Cenário: templateId inválido é rejeitado
#   REQ-EM-N01 (latência ≤ 50ms p95)      — verificado indiretamente no ATDD
#   REQ-EM-N02 (não vaza PII)             — verificado indiretamente no ATDD
#   REQ-EM-N03 (DIP)                      — verificado por inspeção de imports
#   REQ-EM-N04 (LGPD)                     — Cenário: rodapé LGPD em todos os templates
#   REQ-EM-N05 (cobertura)                — transversal (jest.coverageThreshold)
#   REQ-EM-N06 (métricas)                 — verificado indiretamente no ATDD

Funcionalidade: Notificações por E-mail Transacionais

  Eu como sistema api-padrao
  Quero enviar e-mails transacionais nos fluxos críticos
  Para que os usuários sejam notificados sobre eventos relevantes da sua conta

  Contexto:
    Dado que a API está configurada com EMAIL_NOTIFICATIONS_ENABLED=true
    E o adapter de e-mail é o LoggerEmailService (mock Pino)
    E o adapter é espiado para contagem de chamadas e captura de argumentos
    E o diretório de templates em src/shared/infrastructure/templates/v1/ contém 5 templates válidos

  # REQ-EM-01
  Cenário: E-mail de recuperação de senha continua sendo enviado via template auth.password_reset
    Dado que existe um usuário cadastrado e ativo com e-mail "usuario@empresa.com"
    Quando o cliente faz POST /auth/forgot-password com:
      | email | usuario@empresa.com |
    Então o status da resposta deve ser 200
    E o logger de e-mail deve ter sido chamado 1 vez
    E o template "auth.password_reset" deve ter sido renderizado com as variáveis "nome", "link" e "validade"
    E o destinatário da mensagem deve ser "usuario@empresa.com"

  # REQ-EM-06
  Cenário: E-mail de recuperação preserva anti-enumeração
    Quando o cliente faz POST /auth/forgot-password com:
      | email | naoexiste@empresa.com |
    Então o status da resposta deve ser 200
    E o corpo da resposta deve ser vazio
    E o logger de e-mail NÃO deve ter sido chamado

  # REQ-EM-03
  Cenário: E-mail de confirmação enviado após reset de senha
    Dado que existe um usuário cadastrado e ativo com e-mail "usuario@empresa.com"
    E que existe um token de reset válido para esse usuário
    Quando o cliente faz POST /auth/reset-password com:
      | token     | TOKEN_VALIDO  |
      | novaSenha | NovaSenha123! |
    Então o status da resposta deve ser 200
    E o logger de e-mail deve ter sido chamado 1 vez
    E o template "usuarios.password_changed" deve ter sido renderizado
    E o destinatário da mensagem deve ser "usuario@empresa.com"

  # REQ-EM-02
  Cenário: E-mail de boas-vindas enviado ao criar usuário
    Quando o cliente faz POST /usuarios com:
      | email | novo.usuario@empresa.com |
      | senha | SenhaForte123!           |
    Então o status da resposta deve ser 201
    E o logger de e-mail deve ter sido chamado 1 vez
    E o template "usuarios.welcome" deve ter sido renderizado
    E o destinatário da mensagem deve ser "novo.usuario@empresa.com"
    E as variáveis "nome" e "link" devem estar presentes na renderização

  # REQ-EM-02 (kill-switch)
  Cenário: E-mail de boas-vindas NÃO é enviado quando EMAIL_NOTIFICATIONS_ENABLED=false
    Dado que EMAIL_NOTIFICATIONS_ENABLED está configurado como false
    Quando o cliente faz POST /usuarios com:
      | email | novo2@empresa.com |
      | senha | SenhaForte123!   |
    Então o status da resposta deve ser 201
    E o logger de e-mail NÃO deve ter sido chamado

  # REQ-EM-04
  Cenário: E-mail de vínculo a empresa lista os perfis atribuídos
    Dado que existe uma empresa ativa com ID "empresa-uuid"
    E existem perfis "Admin" e "Operador" cadastrados para a empresa
    E existe um usuário ativo com e-mail "novo@empresa.com"
    Quando o admin faz POST /empresas/empresa-uuid/usuarios com:
      | usuarioId | 1      |
      | perfilIds | [1, 2] |
    Então o status da resposta deve ser 201
    E o logger de e-mail deve ter sido chamado 1 vez
    E o template "empresas.user_added" deve ter sido renderizado
    E as variáveis devem conter "perfis=Admin, Operador" (resolvidas via 1 round-trip ao PerfilRepository)

  # REQ-EM-05
  Cenário: E-mail de desativação enviado quando usuário é desativado
    Dado que existe um usuário ativo com e-mail "usuario@empresa.com"
    Quando o admin faz PATCH /usuarios/1 com:
      | ativo | false |
    Então o status da resposta deve ser 200
    E o logger de e-mail deve ter sido chamado 1 vez
    E o template "usuarios.account_disabled" deve ter sido renderizado

  # REQ-EM-07
  Cenário: Falha no envio NÃO bloqueia a request
    Dado que o LoggerEmailService está configurado para lançar exceção em send
    Quando o cliente faz POST /usuarios com:
      | email | novo3@empresa.com |
      | senha | SenhaForte123!   |
    Então o status da resposta deve ser 201
    E o corpo da resposta deve conter o id do usuário criado
    E o logger de e-mail deve ter sido chamado 1 vez (a falha foi engolida)
    E um log warn com "event: 'email.failed'" deve ter sido emitido

  # REQ-EM-09
  Cenário: Renderer de template substitui placeholders corretamente
    Quando o EmailSenderService.send for chamado com template "auth.password_reset", to "x@x.com" e variables:
      | nome     | João         |
      | link     | https://...  |
      | validade | 1 hora       |
    Então o logger de e-mail deve receber um EmailMessage com subject contendo "API Padrão" (APP_NAME injetado)
    E o body deve conter "João" e o link renderizado
    E o body deve conter o link de descadastro "{{APP_LOGIN_URL}}/account/unsubscribe"

  # REQ-EM-09 (fail-fast de authoring)
  Cenário: Renderer lança erro se placeholder obrigatório está ausente em variables
    Quando o EmailSenderService.send for chamado com template "auth.password_reset", to "x@x.com" e variables:
      | nome | João         |
      | link | https://...  |
    Então uma exceção deve ser lançada com mensagem mencionando "Placeholder {{validade}}"

  # REQ-EM-10 (regex whitelist)
  Cenário: templateId inválido é rejeitado e logado
    Quando o EmailSenderService.send for chamado com templateId "../../etc/passwd" e to "x@x.com"
    Então um log warn deve ser emitido
    E o logger de e-mail NÃO deve ter sido chamado
    E o fs.readFile NÃO deve ter sido invocado para caminho arbitrário

  # REQ-EM-10 (KNOWN_TEMPLATES whitelist)
  Cenário: templateId fora da whitelist é rejeitado e logado
    Quando o EmailSenderService.send for chamado com templateId "template_inexistente" e to "x@x.com"
    Então um log warn deve ser emitido
    E o logger de e-mail NÃO deve ter sido chamado

  # REQ-EM-08
  Cenário: Aplicação não sobe se template obrigatório está ausente
    Dado que o arquivo "src/shared/infrastructure/templates/v1/usuarios.welcome.tpl" não existe
    Quando a aplicação for inicializada
    Então o bootstrap deve falhar com erro mencionando o template ausente "usuarios.welcome"

  # REQ-EM-N04 (LGPD)
  Cenário: Rodapé LGPD presente em todos os 5 templates
    Quando o TemplateLoaderService.loadAll for executado
    Então cada um dos 5 templates deve conter "descadastro" no body
    E cada um dos 5 templates deve conter "dpo@" no body

  # REQ-EM-N02 (não vaza PII em produção)
  Cenário: LoggerEmailService NÃO loga body em NODE_ENV=production
    Dado que NODE_ENV está configurado como "production"
    Quando o LoggerEmailService.send for chamado com:
      | to      | user@example.com |
      | subject | Assunto          |
      | body    | CORPO_SECRETO    |
    Então o Logger do Nest deve receber apenas "to" e "subject" (nunca "CORPO_SECRETO")

  Esquema do Cenário: E-mails de boas-vindas e password_changed cobrem os 5 templates
    Dado que existe um usuário ativo com e-mail "<email>"
    Quando o cliente faz <request> com payload válido
    Então o logger de e-mail deve ter sido chamado 1 vez
    E o template "<template>" deve ter sido renderizado para "<email>"

    Exemplos:
      | request                            | template                       | email                |
      | POST /usuarios                     | usuarios.welcome               | welcome@empresa.com  |
      | POST /auth/forgot-password         | auth.password_reset            | reset@empresa.com    |
      | POST /auth/reset-password (válido) | usuarios.password_changed      | changed@empresa.com  |
      | PATCH /usuarios/1 (ativo:false)    | usuarios.account_disabled      | disabled@empresa.com |
      | POST /empresas/<id>/usuarios       | empresas.user_added            | added@empresa.com    |
