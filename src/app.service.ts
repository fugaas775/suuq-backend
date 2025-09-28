import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  constructor(private readonly dataSource: DataSource) {}

  getHello(): string {
    return 'Hello World!';
  }

  // Removed legacy auto patcher. Migrations are now the single source of truth.

  async getHealth(): Promise<Record<string, any>> {
    const start = Date.now();
    let dbOk = false;
    let indexIssues: string[] = [];
    try {
      // Check a trivial query
      await this.dataSource.query('SELECT 1');
      dbOk = true;
      // Validate critical indexes exist (by name)
      const wanted = [
        'IDX_user_verification_status',
        'IDX_user_created_at',
        'idx_products_listing_type',
        'idx_products_bedrooms',
        'idx_products_city',
        'idx_products_listing_type_bedrooms',
        'idx_products_city_type_bedrooms_created',
      ];
      const rows = await this.dataSource.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY($1)`,
        [wanted],
      );
      const present = new Set(rows.map((r: any) => r.indexname));
      indexIssues = wanted.filter((n) => !present.has(n));
    } catch (e) {
      this.logger.warn('Health DB check failed: ' + (e as Error).message);
    }
    return {
      status: dbOk && indexIssues.length === 0 ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      db: dbOk ? 'up' : 'down',
      indexIssues,
      latencyMs: Date.now() - start,
    };
  }

  getStatus(): Record<string, any> {
    return {
      service: 'SUUQ API',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      memory: {
        used:
          Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) /
          100,
        total:
          Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) /
          100,
      },
      uptime: {
        seconds: Math.floor(process.uptime()),
        human: this.formatUptime(process.uptime()),
      },
    };
  }

  private formatUptime(uptime: number): string {
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
}
