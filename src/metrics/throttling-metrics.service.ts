import { Injectable } from '@nestjs/common';

interface Counters {
  [k: string]: number;
}
let INSTANCE: ThrottlingMetricsService | undefined;

@Injectable()
export class ThrottlingMetricsService {
  private counters: Counters = {};
  constructor() {
    INSTANCE = this;
  }
  increment(key: string, by = 1) {
    this.counters[key] = (this.counters[key] || 0) + by;
  }
  snapshot() {
    return { ...this.counters };
  }
  reset() {
    this.counters = {};
  }
}

export function getThrottlingMetrics(): ThrottlingMetricsService | undefined {
  return INSTANCE;
}
