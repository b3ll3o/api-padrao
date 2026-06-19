// BDD: features/observabilidade.feature:Cenário: Métricas RED-USE expostas em /metrics
// SDD: .openspec/changes/observabilidade/design.md:REQ-METRICS-001..005
// ATDD: test/metrics.e2e-spec.ts
// TDD: src/shared/infrastructure/metrics/registry.spec.ts
//
// Implementação de métricas em formato Prometheus 0.0.4 (text-based exposition).
// Sem dependências externas — Counter e Histogram são primitivos pequenos e
// testáveis. Buckets do histograma são fixos no padrão Prometheus para latência
// HTTP: 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000 ms.
//
// Padrão RED-USE:
//   Rate:     http_requests_total (counter, labels: method, route, status)
//   Errors:   http_requests_total filtrado por status>=400
//   Duration: http_request_duration_ms (histogram, labels: method, route, status)
//   Utilization/Saturation/Errors: workers_busy (gauge), prisma_pool_active (gauge)

export type LabelValues = Record<string, string>;

const HTTP_DURATION_BUCKETS_MS = [
  5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
] as const;

/**
 * Escapa caracteres especiais em label values conforme especificação
 * Prometheus exposition format (backslash, double-quote, newline).
 */
function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Escapa nomes de label — Prometheus permite [a-zA-Z_][a-zA-Z0-9_]*.
 * Caracteres inválidos são substituídos por underscore.
 */
function sanitizeLabelName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Formata labels Prometheus: `{key="value",key2="value2"}` ou string vazia.
 */
function formatLabels(labels: LabelValues | undefined): string {
  if (!labels || Object.keys(labels).length === 0) return '';
  const parts = Object.entries(labels).map(
    ([k, v]) => `${sanitizeLabelName(k)}="${escapeLabelValue(String(v))}"`,
  );
  return `{${parts.join(',')}}`;
}

/**
 * Counter — valor monotônico crescente. Usado para contagem de eventos
 * (requests, errors, jobs processados, etc.).
 */
export class Counter {
  constructor(public readonly name: string) {}

  inc(amount = 1, labels?: LabelValues): void {
    const key = JSON.stringify(labels ?? {});
    const slot = this.slotFor(key, labels);
    slot.value += amount;
  }

  private slots = new Map<string, { labels?: LabelValues; value: number }>();
  private slotFor(key: string, labels: LabelValues | undefined) {
    let slot = this.slots.get(key);
    if (!slot) {
      slot = { labels, value: 0 };
      this.slots.set(key, slot);
    }
    return slot;
  }

  /**
   * Serializa em formato Prometheus 0.0.4:
   *   # TYPE <name> counter
   *   <name>{labels} <value>
   */
  serialize(): string {
    const lines: string[] = [`# TYPE ${this.name} counter`];
    if (this.slots.size === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const slot of this.slots.values()) {
        lines.push(`${this.name}${formatLabels(slot.labels)} ${slot.value}`);
      }
    }
    return lines.join('\n');
  }

  /** Para testes: obtém o valor atual de um slot de labels. */
  getValue(labels?: LabelValues): number {
    const key = JSON.stringify(labels ?? {});
    return this.slots.get(key)?.value ?? 0;
  }
}

/**
 * Gauge — valor que pode subir ou descer. Usado para saturação
 * (fila cheia, pool saturado, memória).
 */
export class Gauge {
  private slots = new Map<string, { labels?: LabelValues; value: number }>();

  constructor(public readonly name: string) {}

  set(value: number, labels?: LabelValues): void {
    const key = JSON.stringify(labels ?? {});
    this.slots.set(key, { labels, value });
  }

  inc(amount = 1, labels?: LabelValues): void {
    const key = JSON.stringify(labels ?? {});
    const slot = this.ensureSlot(key, labels);
    slot.value += amount;
  }

  dec(amount = 1, labels?: LabelValues): void {
    const key = JSON.stringify(labels ?? {});
    const slot = this.ensureSlot(key, labels);
    slot.value -= amount;
  }

  private ensureSlot(key: string, labels: LabelValues | undefined) {
    let slot = this.slots.get(key);
    if (!slot) {
      slot = { labels, value: 0 };
      this.slots.set(key, slot);
    }
    return slot;
  }

  serialize(): string {
    const lines: string[] = [`# TYPE ${this.name} gauge`];
    if (this.slots.size === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const slot of this.slots.values()) {
        lines.push(`${this.name}${formatLabels(slot.labels)} ${slot.value}`);
      }
    }
    return lines.join('\n');
  }

  getValue(labels?: LabelValues): number {
    const key = JSON.stringify(labels ?? {});
    return this.slots.get(key)?.value ?? 0;
  }
}

/**
 * Histogram — observa valores em buckets cumulativos. Usado para
 * latência (http_request_duration_ms) e tamanhos.
 *
 * O bucket le=+Inf sempre existe (não é emitido separadamente; Prometheus
 * infere). `_sum` e `_count` são emitidos.
 */
export class Histogram {
  readonly buckets: readonly number[];
  private slots = new Map<
    string,
    {
      labels?: LabelValues;
      bucketCounts: number[];
      sum: number;
      count: number;
    }
  >();

  constructor(
    public readonly name: string,
    buckets: readonly number[] = HTTP_DURATION_BUCKETS_MS,
  ) {
    // Clona e valida ordem estritamente crescente (sem duplicatas)
    for (let i = 1; i < buckets.length; i++) {
      if (buckets[i] <= buckets[i - 1]) {
        throw new Error(
          `Histogram ${name}: buckets devem ser estritamente crescentes (rejeitado: ${buckets[i - 1]} >= ${buckets[i]})`,
        );
      }
    }
    this.buckets = [...buckets];
  }

  observe(value: number, labels?: LabelValues): void {
    const key = JSON.stringify(labels ?? {});
    let slot = this.slots.get(key);
    if (!slot) {
      slot = {
        labels,
        bucketCounts: new Array(this.buckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.slots.set(key, slot);
    }
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        slot.bucketCounts[i]++;
      }
    }
    slot.sum += value;
    slot.count++;
  }

  serialize(): string {
    const out: string[] = [`# TYPE ${this.name} histogram`];
    if (this.slots.size === 0) {
      // Sem observações ainda — emite um slot vazio sem labels
      out.push(
        this.serializeSlot(undefined, {
          bucketCounts: new Array(this.buckets.length).fill(0),
          sum: 0,
          count: 0,
        }),
      );
    } else {
      for (const slot of this.slots.values()) {
        out.push(this.serializeSlot(slot.labels, slot));
      }
    }
    return out.join('\n');
  }

  private serializeSlot(
    labels: LabelValues | undefined,
    slot: { bucketCounts: number[]; sum: number; count: number },
  ): string {
    const lines: string[] = [];
    // Buckets cumulativos
    for (let i = 0; i < this.buckets.length; i++) {
      const leLabels: LabelValues = {
        ...(labels ?? {}),
        le: String(this.buckets[i]),
      };
      lines.push(
        `${this.name}_bucket${formatLabels(leLabels)} ${slot.bucketCounts[i]}`,
      );
    }
    // +Inf bucket
    const infLabels: LabelValues = { ...(labels ?? {}), le: '+Inf' };
    lines.push(`${this.name}_bucket${formatLabels(infLabels)} ${slot.count}`);
    // _sum e _count
    lines.push(
      `${this.name}_sum${formatLabels(labels)} ${this.formatNumber(slot.sum)}`,
    );
    lines.push(`${this.name}_count${formatLabels(labels)} ${slot.count}`);
    return lines.join('\n');
  }

  private formatNumber(n: number): string {
    // Prometheus aceita números em notação científica padrão; usamos
    // toString() para números finitos e +Inf/-Inf para especiais
    if (Number.isFinite(n)) return n.toString();
    if (n === Infinity) return '+Inf';
    if (n === -Infinity) return '-Inf';
    return String(n);
  }

  getCount(labels?: LabelValues): number {
    const key = JSON.stringify(labels ?? {});
    return this.slots.get(key)?.count ?? 0;
  }

  getSum(labels?: LabelValues): number {
    const key = JSON.stringify(labels ?? {});
    return this.slots.get(key)?.sum ?? 0;
  }
}

/**
 * Registry — coleção nomeada de métricas. Singleton, injetada como Provider.
 * Mantém referência aos instrumentos para que o `MetricsController` e o
 * `HttpMetricsInterceptor` possam operá-los.
 */
export class MetricsRegistry {
  readonly httpRequests = new Counter('http_requests_total');
  readonly httpDurationMs = new Histogram('http_request_duration_ms');
  readonly httpErrors = new Counter('http_request_errors_total');
  readonly prismaPoolActive = new Gauge('prisma_pool_active_connections');
  readonly prismaPoolIdle = new Gauge('prisma_pool_idle_connections');
  readonly bullQueueWaiting = new Gauge('bull_queue_waiting_jobs');
  readonly bullQueueActive = new Gauge('bull_queue_active_jobs');
  readonly bullQueueFailed = new Gauge('bull_queue_failed_jobs');
  readonly processResidentMb = new Gauge('process_resident_memory_mb');

  serialize(): string {
    return [
      this.httpRequests.serialize(),
      this.httpDurationMs.serialize(),
      this.httpErrors.serialize(),
      this.prismaPoolActive.serialize(),
      this.prismaPoolIdle.serialize(),
      this.bullQueueWaiting.serialize(),
      this.bullQueueActive.serialize(),
      this.bullQueueFailed.serialize(),
      this.processResidentMb.serialize(),
    ].join('\n\n');
  }
}
