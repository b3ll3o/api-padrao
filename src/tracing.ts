// src/tracing.ts

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

// Configure the OTLP exporter
const traceExporter = new OTLPTraceExporter({
  url:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    'http://localhost:4318/v1/traces', // Default para ambiente de dev local sem Docker
});

// Configure the SDK
const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Opcional: configurar auto-instrumentações específicas
      // Exemplo: ignorar rotas de health check
      // '@opentelemetry/instrumentation-http': {
      //   ignoreIncomingPaths: ['/healthz'],
      // },
    }),
    new NestInstrumentation(), // Instrumentação específica para NestJS
  ],
});

// Initialize the SDK
sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('OpenTelemetry shut down successfully'))
    .catch((error) =>
      console.error('Error shutting down OpenTelemetry:', error),
    )
    .finally(() => process.exit(0));
});

export default sdk;
