import { Injectable } from '@nestjs/common';

// Minimal Prometheus exposition without external deps
// Provides counters and histograms for HTTP requests and a text exposition at /metrics

type LabelValues = Record<string, string>;

class Counter {
  private counts = new Map<string, number>();
  constructor(
    public name: string,
    public help: string,
    private labelNames: string[],
  ) {}
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
    const arr = this.observations.get(k);
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
      lines.push(
        `${this.name}_bucket{${baseLabels},le="+Inf"} ${arr[this.buckets.length]}`,
      );
      lines.push(
        `${this.name}_count{${baseLabels}} ${arr[this.buckets.length]}`,
      );
      lines.push(
        `${this.name}_sum{${baseLabels}} ${arr[this.buckets.length + 1]}`,
      );
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
  private readonly httpRequestsByStatusClass = new Counter(
    'http_requests_by_status_class_total',
    'Total number of HTTP requests grouped by status class',
    ['method', 'route', 'status_class'],
  );
  private readonly httpFailedRequests = new Counter(
    'http_requests_failed_total',
    'Total number of failed HTTP requests (status >= 400)',
    ['method', 'route', 'status', 'status_class'],
  );
  private readonly httpDuration = new Histogram(
    'http_request_duration_seconds',
    'Duration of HTTP requests in seconds',
    [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    ['method', 'route', 'status'],
  );
  private readonly legacyRouteRewrites = new Counter(
    'legacy_route_rewrites_total',
    'Total number of legacy route rewrites',
    ['legacy_route', 'target_route'],
  );
  private readonly homeFeedHydrationResponses = new Counter(
    'home_feed_hydration_responses_total',
    'Total number of v2 home feed responses grouped by hydration stage',
    ['stage', 'status'],
  );
  private readonly homeFeedHydrationDuration = new Histogram(
    'home_feed_hydration_duration_seconds',
    'Duration of v2 home feed responses grouped by hydration stage in seconds',
    [0.1, 0.25, 0.5, 1, 2, 3, 5, 8, 13, 21, 34],
    ['stage', 'status'],
  );
  private readonly homeFeedImmersiveStripAttempts = new Counter(
    'home_feed_immersive_strip_attempts_total',
    'Total number of immersive-strip card attempts on v2 home feed responses',
    ['stage', 'status'],
  );
  private readonly homeFeedImmersiveStripOutcomes = new Counter(
    'home_feed_immersive_strip_outcomes_total',
    'Total number of immersive-strip outcomes on v2 home feed responses',
    ['stage', 'status', 'outcome'],
  );

  incHttpRequests(method: string, route: string, status: number) {
    this.httpRequests.inc({ method, route, status: String(status) });
  }

  incHttpRequestsByStatusClass(
    method: string,
    route: string,
    statusClass: string,
  ) {
    this.httpRequestsByStatusClass.inc({
      method,
      route,
      status_class: statusClass,
    });
  }

  incHttpFailedRequests(
    method: string,
    route: string,
    status: number,
    statusClass: string,
  ) {
    this.httpFailedRequests.inc({
      method,
      route,
      status: String(status),
      status_class: statusClass,
    });
  }

  observeDuration(
    method: string,
    route: string,
    status: number,
    seconds: number,
  ) {
    this.httpDuration.observe(
      { method, route, status: String(status) },
      seconds,
    );
  }

  incLegacyRouteRewrite(legacyRoute: string, targetRoute: string) {
    this.legacyRouteRewrites.inc({
      legacy_route: legacyRoute,
      target_route: targetRoute,
    });
  }

  observeHomeFeedHydration(
    stage: string,
    status: number,
    durationSeconds: number,
  ) {
    const normalizedStage = (stage || 'unknown').trim() || 'unknown';
    const statusText = String(status || 0);
    this.homeFeedHydrationResponses.inc({
      stage: normalizedStage,
      status: statusText,
    });
    this.homeFeedHydrationDuration.observe(
      {
        stage: normalizedStage,
        status: statusText,
      },
      Math.max(0, Number(durationSeconds) || 0),
    );
  }

  observeHomeFeedImmersiveStrip(
    stage: string,
    status: number,
    telemetry: {
      attempted: number;
      hydrated: number;
      fallbackUsed: number;
      noMatch: number;
    },
  ) {
    const normalizedStage = (stage || 'unknown').trim() || 'unknown';
    const statusText = String(status || 0);
    const attempted = Math.max(0, Number(telemetry?.attempted) || 0);
    const hydrated = Math.max(0, Number(telemetry?.hydrated) || 0);
    const fallbackUsed = Math.max(0, Number(telemetry?.fallbackUsed) || 0);
    const noMatch = Math.max(0, Number(telemetry?.noMatch) || 0);

    if (attempted > 0) {
      this.homeFeedImmersiveStripAttempts.inc(
        {
          stage: normalizedStage,
          status: statusText,
        },
        attempted,
      );
    }
    if (hydrated > 0) {
      this.homeFeedImmersiveStripOutcomes.inc(
        {
          stage: normalizedStage,
          status: statusText,
          outcome: 'hydrated',
        },
        hydrated,
      );
    }
    if (fallbackUsed > 0) {
      this.homeFeedImmersiveStripOutcomes.inc(
        {
          stage: normalizedStage,
          status: statusText,
          outcome: 'fallback',
        },
        fallbackUsed,
      );
    }
    if (noMatch > 0) {
      this.homeFeedImmersiveStripOutcomes.inc(
        {
          stage: normalizedStage,
          status: statusText,
          outcome: 'no_match',
        },
        noMatch,
      );
    }
  }

  metrics(): string {
    const parts = [
      this.httpRequests.collect(),
      this.httpRequestsByStatusClass.collect(),
      this.httpFailedRequests.collect(),
      this.httpDuration.collect(),
      this.legacyRouteRewrites.collect(),
      this.homeFeedHydrationResponses.collect(),
      this.homeFeedHydrationDuration.collect(),
      this.homeFeedImmersiveStripAttempts.collect(),
      this.homeFeedImmersiveStripOutcomes.collect(),
    ];
    return parts.filter(Boolean).join('\n') + '\n';
  }
}
