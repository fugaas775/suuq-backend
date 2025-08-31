import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly dataSource: DataSource) {}

  async checkHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  async checkReadiness() {
    const checks = {
      database: await this.checkDatabase(),
    };

    const isReady = Object.values(checks).every(
      (check) => check.status === 'ok',
    );

    return {
      status: isReady ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkDatabase() {
    try {
      // Simple query to check database connectivity
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return {
        status: 'error',
        message: 'Database connection failed',
      };
    }
  }
}
