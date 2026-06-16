Funcionalidade: Isolamento Multi-Tenant via Prisma Extension

Eu como sistema
Quero isolar dados por empresa (tenant)
Para que usuários de uma empresa não vejam ou modifiquem dados de outras empresas

Contexto:
  Dado que o usuário autenticado pertence à empresa com ID "empresa-A"
  E a empresaId está disponível no contexto (AsyncLocalStorage)

Esquema do Cenário: Leituras filtram por empresaId automaticamente
  Quando o sistema executa uma operação <operacao> no modelo <modelo>
  Então a cláusula WHERE foi estendida com "empresaId: 'empresa-A'" automaticamente
  E registros de outras empresas (empresaId != "empresa-A") não aparecem no resultado

  Exemplos:
    | modelo         | operacao  |
    | Perfil         | findMany  |
    | Perfil         | findFirst |
    | Perfil         | count     |
    | UsuarioEmpresa | findMany  |
    | UsuarioEmpresa | findFirst |

Esquema do Cenário: Updates são restritos ao tenant atual
  Quando o sistema executa uma operação <operacao> no modelo <modelo> com:
    | data | { nome: "Novo" } |
  Então a cláusula WHERE inclui "empresaId: 'empresa-A'"
  E registros de outras empresas NÃO são afetados pelo update

  Exemplos:
    | modelo         | operacao   |
    | Perfil         | update     |
    | Perfil         | updateMany |
    | UsuarioEmpresa | update     |
    | UsuarioEmpresa | updateMany |

Esquema do Cenário: Deletes são restritos ao tenant atual
  Quando o sistema executa uma operação <operacao> no modelo <modelo> com:
    | where | { id: 10 } |
  Então a cláusula WHERE inclui "empresaId: 'empresa-A'"
  E registros de outras empresas NÃO são deletados

  Exemplos:
    | modelo         | operacao   |
    | Perfil         | delete     |
    | Perfil         | deleteMany |
    | UsuarioEmpresa | delete     |
    | UsuarioEmpresa | deleteMany |

Cenário: findUnique é convertido em findFirst (unique key composta)
  Dado que o modelo UsuarioEmpresa tem unique key composta [usuarioId, empresaId]
  Quando o sistema executa findUnique com:
    | where | { usuarioId_empresaId: { usuarioId: 1, empresaId: "empresa-A" } } |
  Então a operação é convertida em findFirst
  E o where é desconstruído em { usuarioId: 1, empresaId: "empresa-A" }

Cenário: Admin pode criar registro em outra empresa
  Dado que o admin quer criar um Perfil para a empresa "empresa-B" (não a do JWT)
  Quando o sistema executa create com data contendo empresaId: "empresa-B"
  Então a empresaId injetada pelo contexto NÃO sobrescreve o valor explícito
  E o registro é criado com empresaId: "empresa-B"

Cenário: Create sem empresaId explícita injeta a do contexto
  Dado que o sistema executa create no modelo Perfil sem data.empresaId
  Então o campo data.empresaId é preenchido com "empresa-A" (do contexto)

Esquema do Cenário: Modelos fora de multiTenantModels não são escopados
  Dado que o modelo <modelo> NÃO está em multiTenantModels
  Quando o sistema executa uma operação no modelo
  Então a cláusula where NÃO é estendida com empresaId automaticamente

  Exemplos:
    | modelo    |
    | Usuario   |
    | Empresa   |
    | Permissao |

Cenário: Ausência de contexto (empresaId) não quebra o sistema
  Dado que o sistema NÃO tem contexto de tenant (rota pública)
  Quando o sistema executa findMany no modelo Perfil
  Então a operação prossegue sem erro
  E nenhum filtro de empresaId é aplicado
