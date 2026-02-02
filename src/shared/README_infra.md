# Infraestrutura e Observabilidade

Este documento descreve os componentes técnicos que suportam a execução e o monitoramento da API.

## 1. Docker e Containerização

A aplicação utiliza um `Dockerfile` otimizado com **multi-stage build**:
- **Builder stage**: Instala dependências do sistema e de build, gera o cliente Prisma e compila o TypeScript.
- **Production stage**: Utiliza uma imagem leve (`node:alpine`), copia apenas o necessário (`dist`, `node_modules`, `prisma`) e executa com um usuário não-root (`appuser`) por questões de segurança.

### Docker Compose
O arquivo `docker-compose.yml` orquestra os seguintes serviços:
- `postgres`: Banco de dados principal (Porta 5433 local).
- `pgadmin`: Interface web para gerenciar o Postgres (Porta 8081).
- `jaeger`: Backend de tracing (Interface na porta 16686).
- `otel-collector`: Coletor OpenTelemetry que recebe spans via OTLP e envia para o Jaeger.

## 2. Observabilidade (OpenTelemetry)

A API possui instrumentação nativa configurada em `src/tracing.ts`.

### Como funciona
1. O SDK do OpenTelemetry inicia antes da aplicação NestJS.
2. As bibliotecas são instrumentadas automaticamente (HTTP, Prisma, NestJS).
3. Os spans (rastros) são enviados via protocolo **OTLP (HTTP)** para o coletor na porta 4318.
4. O coletor repassa os dados para o Jaeger via **gRPC**.

### Verificando Traces
Acesse `http://localhost:16686` para visualizar o caminho de cada requisição, tempos de resposta e possíveis gargalos no banco de dados.

## 3. Configuração de Ambiente

A validação das variáveis de ambiente é feita em `src/config/env.validation.ts` usando Joi.

### Variáveis Obrigatórias
- `PORT`: Porta da aplicação (padrão 3001).
- `NODE_ENV`: `development`, `production` ou `test`.
- `DATABASE_URL`: String de conexão do Prisma.
- `JWT_SECRET`: Chave para assinatura dos tokens.
- `OTEL_EXPORTER_OTLP_ENDPOINT`: Endpoint do coletor OTel.

## 4. Configuração do Coletor OTEL

O arquivo `otel-collector-config.yaml` define como os traces são recebidos e para onde são enviados. Ele está configurado para:
1. Receber dados via **OTLP** (gRPC na porta 4317 e HTTP na porta 4318).
2. Processar os dados (batching).
3. Exportar para o **Jaeger** via gRPC.
