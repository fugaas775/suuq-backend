import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);
  constructor(private readonly dataSource: DataSource) {}

  getHello(): string {
    return 'Hello World!';
  }

  async onModuleInit() {
    // Lightweight column existence check (runs once at startup)
    try {
      const res = await this.dataSource.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='user' AND column_name IN ('verificationRejectionReason','verificationReviewedBy','verificationReviewedAt')`,
      );
      const found = res.map((r: any) => r.column_name);
      const expected = [
        'verificationRejectionReason',
        'verificationReviewedBy',
        'verificationReviewedAt',
      ];
      const missing = expected.filter((c) => !found.includes(c));
      if (missing.length) {
        this.logger.warn(
          `Database missing new verification columns: ${missing.join(', ')}. Run migrations to add them.`,
        );
        if (process.env.AUTO_APPLY_USER_VERIFICATION_COLUMNS === '1') {
          this.logger.log('AUTO_APPLY_USER_VERIFICATION_COLUMNS=1 => attempting automatic patch.');
          try {
            await this.dataSource.query(
              `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "verificationRejectionReason" text;`,
            );
            await this.dataSource.query(
              `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "verificationReviewedBy" varchar(255);`,
            );
            await this.dataSource.query(
              `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "verificationReviewedAt" timestamp;`,
            );
            await this.dataSource.query(
              `CREATE INDEX IF NOT EXISTS "IDX_user_verification_status" ON "user" ("verificationStatus");`,
            );
            await this.dataSource.query(
              `CREATE INDEX IF NOT EXISTS "IDX_user_created_at" ON "user" ("createdAt");`,
            );
            this.logger.log('Automatic column patch applied successfully.');
          } catch (e) {
            this.logger.error('Automatic column patch failed: ' + (e as Error).message);
          }
        }
      }
    } catch (e) {
      this.logger.warn('Startup column check failed: ' + (e as Error).message);
    }

    // Lightweight column existence check for 'vendor' table
    try {
      const res = await this.dataSource.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='vendor' AND column_name IN ('verificationRejectionReason','verificationReviewedBy','verificationReviewedAt')`,
      );
      const found = res.map((r: any) => r.column_name);
      const expected = [
        'verificationRejectionReason',
        'verificationReviewedBy',
        'verificationReviewedAt',
      ];
      const missing = expected.filter((c) => !found.includes(c));
      if (missing.length) {
        this.logger.warn(
          `Database missing new verification columns for vendor: ${missing.join(
            ', ',
          )}. Run migrations to add them.`,
        );
        if (process.env.AUTO_APPLY_USER_VERIFICATION_COLUMNS === '1') {
          this.logger.log(
            'AUTO_APPLY_USER_VERIFICATION_COLUMNS=1 => attempting automatic patch for vendor.',
          );
          try {
            await this.dataSource.query(
              `ALTER TABLE "vendor" ADD COLUMN IF NOT EXISTS "verificationRejectionReason" text;`,
            );
            await this.dataSource.query(
              `ALTER TABLE "vendor" ADD COLUMN IF NOT EXISTS "verificationReviewedBy" integer;`,
            );
            await this.dataSource.query(
              `ALTER TABLE "vendor" ADD COLUMN IF NOT EXISTS "verificationReviewedAt" timestamp;`,
            );
            this.logger.log(
              'Automatic column patch for vendor applied successfully.',
            );
          } catch (e) {
            this.logger.error(
              'Automatic column patch for vendor failed: ' +
                (e as Error).message,
            );
          }
        }
      }
    } catch (e) {
      this.logger.warn(
        'Startup column check for vendor failed: ' + (e as Error).message,
      );
    }
  }

  getHealth(): Record<string, any> {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
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
