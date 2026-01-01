import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class CurrencyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CurrencyService.name);
  private readonly redisKey = 'fx:snapshot';
  // Exchange rates relative to USD
  private rates: Record<string, number> = {
    USD: 1,
    KES: 128.95,
    ETB: 184,
    SOS: 579.59,
    DJF: 177.72,
    // Add more as needed
  };

  private ratesTimestamp = new Date().toISOString();
  private ratesSource: string = 'static';
  private lastFetchAt: string | null = null;
  private fetchInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    await this.hydrateFromStore();
    this.startRemotePolling();
  }

  onModuleDestroy() {
    if (this.fetchInterval) clearInterval(this.fetchInterval);
  }

  /**
   * Converts an amount from one currency to another using USD as the base.
   * @param amount The amount to convert
   * @param fromCurrency The source currency (e.g., 'ETB')
   * @param toCurrency The target currency (e.g., 'KES')
   * @returns The converted amount
   */
  convert(amount: number, fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) return amount;
    const fromRate = this.rates[fromCurrency];
    const toRate = this.rates[toCurrency];
    if (!fromRate || !toRate) {
      throw new Error(`Unsupported currency: ${fromCurrency} or ${toCurrency}`);
    }
    // Convert to USD first, then to target
    const amountInUSD = amount / fromRate;
    const converted = amountInUSD * toRate;
    return Math.round(converted * 100) / 100; // round to 2 decimals
  }

  /** Returns the FX multiplier from `fromCurrency` to `toCurrency` (to/from). */
  getRate(fromCurrency: string, toCurrency = 'USD'): number | null {
    const from = this.rates[fromCurrency];
    const to = this.rates[toCurrency];
    if (!from || !to) return null;
    return to / from;
  }

  /** Converts and returns both amount and rate used for transparency in responses. */
  convertWithRate(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): { amount: number; rate: number } {
    const converted = this.convert(amount, fromCurrency, toCurrency);
    const rate = this.getRate(fromCurrency, toCurrency);
    return { amount: converted, rate: rate ?? 1 };
  }

  /** Snapshot for admin/ops visibility. */
  getRatesSnapshot() {
    return {
      rates: { ...this.rates },
      updatedAt: this.ratesTimestamp,
      source: this.ratesSource,
      lastFetchAt: this.lastFetchAt,
    };
  }

  /** Manual refresh/override for ops (e.g., admin endpoint). */
  refreshRates(
    payload: unknown,
    opts?: {
      persist?: boolean;
      source?: string;
      updatedAt?: string;
      lastFetchAt?: string | null;
    },
  ) {
    const newRates = this.extractRatesPayload(payload);
    if (!newRates) return this.getRatesSnapshot();
    const cleaned = this.normalizeRates(newRates);
    if (!cleaned) return this.getRatesSnapshot();
    this.applyRates(cleaned, opts?.source ?? 'manual', opts);
    return this.getRatesSnapshot();
  }

  /** Fetch from remote feed (if configured) and apply; returns snapshot. */
  async refreshFromRemote(): Promise<
    ReturnType<CurrencyService['getRatesSnapshot']>
  > {
    const url = this.configService.get<string>('FX_FEED_URL');
    if (!url) {
      this.logger.warn('FX_FEED_URL not set; skipping remote FX refresh.');
      return this.getRatesSnapshot();
    }
    try {
      const headers: Record<string, string> = {};
      const apiKey = this.configService.get<string>('FX_FEED_API_KEY');
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const candidate = this.extractRatesPayload(data);
      if (!candidate) {
        throw new Error('Malformed FX payload: missing rates');
      }
      const snap = this.refreshRates(candidate, {
        source: 'remote',
        lastFetchAt: new Date().toISOString(),
      });
      return snap;
    } catch (err) {
      this.logger.warn(
        `Remote FX refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.getRatesSnapshot();
    }
  }

  /** If FX_FEED_URL is set, poll periodically (defaults to hourly). */
  private startRemotePolling() {
    const url = this.configService.get<string>('FX_FEED_URL');
    if (!url) return;
    const intervalMs = Math.max(
      5 * 60 * 1000,
      Number(this.configService.get<string>('FX_FEED_INTERVAL_MS') || 3600000),
    );
    // Initial best-effort fetch
    this.refreshFromRemote().catch(() => {});
    this.fetchInterval = setInterval(() => {
      this.refreshFromRemote().catch(() => {});
    }, intervalMs);
    this.logger.log(`FX polling enabled from ${url} every ${intervalMs}ms`);
  }

  /** Extracts a currency map from common envelope shapes or a bare map. */
  private extractRatesPayload(input: unknown): Record<string, number> | null {
    if (!input || typeof input !== 'object') return null;
    const envelope = input as any;
    const candidates = [
      envelope.rates,
      envelope.data?.rates,
      envelope.data,
      envelope,
    ];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const entries = Object.entries(candidate);
      if (entries.length === 0) continue;
      const hasNumeric = entries.some(
        ([, v]) =>
          typeof v === 'number' ||
          (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))),
      );
      if (hasNumeric) return candidate as Record<string, number>;
    }
    return null;
  }

  /** Validate and normalize raw rate payload into a capped, upper-cased map. */
  private normalizeRates(
    newRates: Record<string, number>,
  ): Record<string, number> | null {
    const cleaned: Record<string, number> = {};
    const MAX_RATE = 1_000_000;
    const MIN_RATE = 0.0001;
    for (const [code, value] of Object.entries(newRates)) {
      const upper = code.trim().toUpperCase();
      const num = Number(value);
      if (!upper || !isFinite(num) || num <= 0) continue;
      const capped = Math.min(Math.max(num, MIN_RATE), MAX_RATE);
      cleaned[upper] = capped;
    }
    // Ensure USD exists and is anchored to 1.0 for consistency
    if (typeof cleaned.USD === 'number') {
      if (cleaned.USD !== 1) {
        this.logger.warn(`USD rate forced to 1.0 (received ${cleaned.USD})`);
      }
      cleaned.USD = 1;
    } else {
      this.logger.warn('USD rate missing; injecting USD=1.0');
      cleaned.USD = 1;
    }
    return Object.keys(cleaned).length ? cleaned : null;
  }

  /** Apply rates to in-memory snapshot and optionally persist. */
  private applyRates(
    cleaned: Record<string, number>,
    source: string,
    opts?: {
      persist?: boolean;
      updatedAt?: string;
      lastFetchAt?: string | null;
    },
  ) {
    this.rates = cleaned;
    this.ratesTimestamp = opts?.updatedAt || new Date().toISOString();
    this.ratesSource = source;
    if (opts?.lastFetchAt !== undefined) {
      this.lastFetchAt = opts.lastFetchAt;
    }

    if (opts?.persist === false) return;
    const snapshot = this.getRatesSnapshot();
    void this.persistSnapshot(snapshot).catch((err) => {
      this.logger.warn(
        `Persist FX snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /** Load persisted snapshot from Redis when available. */
  private async hydrateFromStore() {
    const client = this.redisService.getClient();
    if (!client) return;
    try {
      const raw = await client.get(this.redisKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const payload = this.extractRatesPayload(parsed?.rates || parsed);
      const cleaned = payload ? this.normalizeRates(payload) : null;
      if (!cleaned) return;
      this.applyRates(cleaned, parsed?.source || 'persisted', {
        persist: false,
        updatedAt: parsed?.updatedAt,
        lastFetchAt: parsed?.lastFetchAt ?? null,
      });
      this.logger.log('FX rates hydrated from Redis');
    } catch (err) {
      this.logger.warn(
        `Hydrate FX snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Persist snapshot to Redis if enabled. */
  private async persistSnapshot(
    snapshot: ReturnType<CurrencyService['getRatesSnapshot']>,
  ) {
    const client = this.redisService.getClient();
    if (!client) return;
    await client.set(this.redisKey, JSON.stringify(snapshot));
  }
}
