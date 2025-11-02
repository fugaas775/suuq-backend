import { Injectable } from '@nestjs/common';

// Minimal Prometheus exposition without external deps
// Provides counters and histograms for HTTP requests and a text exposition at /metrics

type LabelValues = Record<string, string>;

class Counter {
  private counts = new Map<string, number>();
  constructor(public name: string, public help: string, private labelNames: string[]) {}
  private key(labels: LabelValues) {
    return this.labelNames.map((n) => labels[n] || '').join('\u0001');
  }
  inc(labels: LabelValues, value = 1) {
    const k = this.key(labels);
    this.counts.set(k, (this.counts.get(k) || 0) + value);
  }
  collect() {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];
    for (const [k, v] of this.counts.entries()) {
      const labelVals = k.split('\u0001');
      const pairs = this.labelNames
        .map((ln, i) => `${ln}="${labelVals[i]}"`)
        .join(',');
      lines.push(`${this.name}{${pairs}} ${v}`);
    }
    return lines.join('\n');
  }
}

class Histogram {
  private buckets: number[];
  private observations = new Map<string, number[]>();
  constructor(
    public name: string,
    public help: string,
    buckets: number[],
    private labelNames: string[],
  ) {
    this.buckets = [...buckets].sort((a, b) => a - b);
  }
  private ensure(labels: LabelValues) {
    const k = this.key(labels);
    if (!this.observations.has(k)) {
      this.observations.set(k, Array(this.buckets.length + 2).fill(0));
    }
    return k;
  }
  private key(labels: LabelValues) {
    return this.labelNames.map((n) => labels[n] || '').join('\u0001');
  }
  observe(labels: LabelValues, value: number) {
    const k = this.ensure(labels);
    const arr = this.observations.get(k)!;
    // bucket counts
    let i = 0;
    while (i < this.buckets.length && value > this.buckets[i]) i++;
    // increment le bucket i (cumulative at render time)
    arr[i] += 1;
    // _count
    arr[this.buckets.length] += 1;
    // _sum
    arr[this.buckets.length + 1] += value;
  }
  collect() {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];
    for (const [k, arr] of this.observations.entries()) {
      const labelVals = k.split('\u0001');
      const baseLabels = this.labelNames
        .map((ln, i) => `${ln}="${labelVals[i]}"`)
        .join(',');
      // cumulative counts per bucket
      let cumulative = 0;
      for (let i = 0; i < this.buckets.length; i++) {
        cumulative += arr[i];
        lines.push(
          `${this.name}_bucket{${baseLabels},le="${this.buckets[i]}"} ${cumulative}`,
        );
      }
      cumulative += 0; // ensure cumulative for +Inf is same as _count
      lines.push(`${this.name}_bucket{${baseLabels},le="+Inf"} ${arr[this.buckets.length]}`);
      lines.push(`${this.name}_count{${baseLabels}} ${arr[this.buckets.length]}`);
      lines.push(`${this.name}_sum{${baseLabels}} ${arr[this.buckets.length + 1]}`);
    }
    return lines.join('\n');
  }
}

@Injectable()
export class PrometheusService {
  private readonly httpRequests = new Counter(
    'http_requests_total',
    'Total number of HTTP requests',
    ['method', 'route', 'status'],
  );
  private readonly httpDuration = new Histogram(
    'http_request_duration_seconds',
    'Duration of HTTP requests in seconds',
    [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    ['method', 'route', 'status'],
  );

  incHttpRequests(method: string, route: string, status: number) {
    this.httpRequests.inc({ method, route, status: String(status) });
  }
  observeDuration(method: string, route: string, status: number, seconds: number) {
    this.httpDuration.observe({ method, route, status: String(status) }, seconds);
  }

  metrics(): string {
    const parts = [this.httpRequests.collect(), this.httpDuration.collect()];
    return parts.filter(Boolean).join('\n') + '\n';
  }
}
