Funcionalidade: Soft-Delete Automático via Prisma Extension

Eu como sistema
Quero aplicar soft-delete automaticamente em modelos sensíveis
Para que exclusões lógicas sejam transparentes para as camadas de aplicação

Contexto:
  Dado que o modelo <modelo> está registrado em softDeleteModels
  E o registro existe no banco com deletedAt null e ativo true

Esquema do Cenário: DELETE é convertido em UPDATE com deletedAt e ativo=false
  Quando o sistema executa uma operação DELETE no modelo <modelo> com:
    | id | 42 |
  Então o registro continua existindo no banco (não há DELETE físico)
  E o campo deletedAt foi definido como a data/hora atual
  E o campo ativo foi definido como false
  E a operação retornou o registro atualizado

  Exemplos:
    | modelo    |
    | Usuario   |
    | Perfil    |
    | Permissao |
    | Empresa   |

Esquema do Cenário: Leituras aplicam filtro deletedAt: null automaticamente
  Quando o sistema executa uma operação <operacao> no modelo <modelo>
  Então a cláusula WHERE foi estendida com "deletedAt: null" automaticamente
  E registros soft-deletados (deletedAt != null) não aparecem no resultado

  Exemplos:
    | modelo    | operacao           |
    | Usuario   | findMany           |
    | Usuario   | findFirst          |
    | Usuario   | findUnique         |
    | Usuario   | findFirstOrThrow   |
    | Usuario   | findUniqueOrThrow  |
    | Empresa   | count              |

Esquema do Cenário: where.deletedAt explícito não é sobrescrito
  Dado que o sistema executa uma operação <operacao> com where:
    | deletedAt | 2026-01-01T00:00:00Z |
  Então o filtro injetado NÃO sobrescreve o valor explícito
  E a consulta usa o valor de deletedAt fornecido pelo caller

  Exemplos:
    | operacao   |
    | findMany   |
    | findFirst  |
    | findUnique |

Esquema do Cenário: DELETE Many também aciona soft-delete
  Quando o sistema executa uma operação deleteMany no modelo <modelo>
  Então a operação é convertida em updateMany
  E todos os registros afetados recebem deletedAt = data/hora atual
  E todos os registros afetados recebem ativo = false

  Exemplos:
    | modelo    |
    | Usuario   |
    | Perfil    |
    | Permissao |
    | Empresa   |

Cenário: Modelos fora de softDeleteModels não recebem soft-delete
  Dado que o modelo "UsuarioEmpresa" NÃO está em softDeleteModels
  Quando o sistema executa uma operação DELETE no modelo UsuarioEmpresa
  Então o registro é REMOVIDO fisicamente do banco (DELETE real)
  E o campo deletedAt não é definido

Cenário: Soft-delete preserva dados para auditoria
  Dado que o usuário com ID 1 foi soft-deletado em "2026-01-01"
  Quando o sistema consulta o registro com findFirst incluindo deletados
  Então o registro é retornado
  E deletedAt contém "2026-01-01"
  E ativo é false
  E todos os outros campos estão preservados
