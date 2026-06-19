# language: pt
# encoding: utf-8
# Source of truth: .openspec/changes/observabilidade/design.md:REQ-QUEUE-002
#
# Auditoria assíncrona via fila BullMQ.
#
# Por que uma fila?
#   O request HTTP não pode esperar pelo INSERT no AuditLog — isso
#   acoplaria latência de DB a cada chamada. Em vez disso, o
#   AuditInterceptor enfileira o evento na fila `audit` e responde
#   imediatamente. O AuditProcessor (worker) persiste no banco em
#   background, com retry exponencial em caso de falha.
#
# LGPD: dados sensíveis (cpf, cnpj, telefone, email) JÁ SÃO sanitizados
# no AuditInterceptor (mascarados como '********') ANTES de enfileirar.
# O processor não toca em PII; ele confia que os dados chegam limpos.

Funcionalidade: Eventos de auditoria processados assincronamente
  Como operador do sistema
  Quero que toda ação auditada seja persistida de forma assíncrona
  Para que falhas de DB não afetem a experiência do usuário e que
  requests sensíveis não esperem por I/O de auditoria

  Cenário: Evento de auditoria enfileirado é persistido
    Dado que um usuário autenticado executa "POST /usuarios"
    Quando o request retorna 201 Created
    Então o AuditInterceptor enfileira um job na fila "audit" com:
      | campo      | valor              |
      | acao       | usuario.create     |
      | recurso    | usuario:42         |
      | usuarioId  | <id do JWT>        |
    E o AuditProcessor consome o job
    E um registro é criado na tabela "AuditLog"

  Cenário: Dados sensíveis são sanitizados ANTES de enfileirar
    Dado um request com query string "?email=alice@empresa.com"
    Quando o AuditInterceptor captura os detalhes
    Então o campo "detalhes.query.email" no job é "********"
    E nenhum byte do email original aparece no payload da fila

  Cenário: Falha transitória de DB aciona retry exponencial
    Dado que o Prisma lança "db unavailable" ao processar um job
    Quando o AuditProcessor tenta persistir
    Então o BullMQ retenta com backoff 1s → 2s → 4s
    E o job NÃO é marcado como failed antes da 3ª tentativa
    E se a 3ª tentativa também falhar, o job fica em "failed" para inspeção

  Cenário: Sucesso libera o job da fila (removeOnComplete)
    Dado um job processado com sucesso
    Quando o AuditProcessor confirma o INSERT
    Então o BullMQ remove o job da fila (libera Redis)
    E o histórico de auditoria fica no banco, não no Redis

  Cenário: Auditoria de login com sucesso é registrada
    Dado que um usuário autenticou com sucesso
    Quando o login retorna 201
    Então um AuditLog é criado com acao="login.success"
    E o campo usuarioId contém o id do usuário
    E o campo ip contém o IP do request
