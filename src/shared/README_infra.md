# Infraestrutura e Observabilidade

Este documento descreve os componentes técnicos que suportam a execução e o monitoramento da API. A visão geral do projeto e o catálogo de comandos estão em [AGENTS.md](../../AGENTS.md).

## 1. Docker e Containerização

A aplicação utiliza um `Dockerfile` otimizado com **multi-stage build**:

- **Builder stage**: instala dependências do sistema e de build, gera o cliente Prisma e compila o TypeScript.
- **Production stage**: utiliza uma imagem leve (`node:alpine`), copia apenas o necessário (`dist`, `node_modules`, `prisma`) e executa com um usuário não-root (`appuser`) por questões de segurança.

### Docker Compose

O arquivo `docker-compose.yml` orquestra os seguintes serviços:

- `postgres`: banco de dados principal (porta **5434** no host, 5432 no container).
- `pgadmin`: interface web para gerenciar o Postgres (porta 8081).
- `jaeger`: backend de tracing (interface na porta 16686).
- `otel-collector`: coletor OpenTelemetry que recebe spans via OTLP e envia para o Jaeger.
- `redis`: cache e filas (BullMQ, porta 6379).

Existe também `docker-compose.dev.yml` para subir apenas Postgres + pgAdmin + Jaeger + OTEL Collector (sem API nem Redis), útil para desenvolvimento contra a API rodando fora do container.

### Comandos úteis

```bash
docker compose up -d                      # stack completa
docker compose up -d postgres redis       # mínimo para dev local
docker compose -f docker-compose.dev.yml up -d   # stack de dev sem API
docker compose down                       # parar tudo
docker compose down -v                    # parar e remover volumes
docker compose logs -f postgres           # acompanhar logs
```

## 2. Observabilidade (OpenTelemetry)

A API possui instrumentação nativa configurada em [src/tracing.ts](../tracing.ts).

### Como funciona

1. O SDK do OpenTelemetry inicia **antes** da aplicação NestJS (importado como primeira linha de `src/main.ts`).
2. As bibliotecas são instrumentadas automaticamente (HTTP, Prisma, NestJS).
3. Os spans (rastros) são enviados via protocolo **OTLP (HTTP)** para o coletor na porta 4318.
4. O coletor repassa os dados para o Jaeger via **gRPC**.

### Verificando Traces

Acesse `http://localhost:16686` para visualizar o caminho de cada requisição, tempos de resposta e possíveis gargalos no banco de dados.

## 3. Configuração de Ambiente

A validação das variáveis de ambiente é feita em [src/config/env.validation.ts](../config/env.validation.ts) usando Joi. A tabela canônica com defaults está no [AGENTS.md](../../AGENTS.md#variáveis-de-ambiente). As variáveis marcadas como `required()` no schema são obrigatórias; as demais têm default e podem ser omitidas em dev.

## 4. Configuração do Coletor OTEL

O arquivo `otel-collector-config.yaml` define como os traces são recebidos e para onde são enviados. Ele está configurado para:

1. Receber dados via **OTLP** (gRPC na porta 4317 e HTTP na porta 4318).
2. Processar os dados (batching).
3. Exportar para o **Jaeger** via gRPC.

## Documentos relacionados

- [README.md](./README.md) — visão geral do módulo `shared`.
- [AGENTS.md](../../AGENTS.md) — fonte de verdade única para arquitetura, comandos e convenções.
