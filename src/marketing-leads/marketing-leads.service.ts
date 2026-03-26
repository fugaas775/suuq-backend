import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { appendFile, mkdir, readFile } from 'fs/promises';
import { dirname } from 'path';
import { EmailService } from '../email/email.service';
import { CreateMarketingLeadDto } from './dto/create-marketing-lead.dto';

type MarketingLeadContext = {
  ip: string;
  referer: string;
  userAgent: string;
};

export type MarketingLeadRecord = {
  submittedAt: string;
  language: string;
  type: string;
  name: string;
  company: string;
  email: string;
  message: string;
  ip: string;
  referer: string;
  userAgent: string;
};

type MarketingLeadListOptions = {
  limit: number;
  type?: string;
  search?: string;
};

@Injectable()
export class MarketingLeadsService {
  private readonly logger = new Logger(MarketingLeadsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async captureLead(
    payload: CreateMarketingLeadDto,
    context: MarketingLeadContext,
  ) {
    const record: MarketingLeadRecord = {
      submittedAt: new Date().toISOString(),
      language: (payload.language || 'en').trim() || 'en',
      type: payload.type.trim(),
      name: payload.name.trim(),
      company: (payload.company || '').trim(),
      email: payload.email.trim(),
      message: payload.message.trim(),
      ip: context.ip,
      referer: context.referer,
      userAgent: context.userAgent,
    };

    await this.persistLead(record);
    await this.deliverLead(record);

    this.logger.log(
      `Captured marketing lead type=${record.type} email=${record.email}`,
    );

    return {
      ok: true,
      submittedAt: record.submittedAt,
    };
  }

  async listRecentLeads(options: MarketingLeadListOptions) {
    const filePath = this.getLeadsFilePath();
    const lines = await this.readLeadLines(filePath);
    const records = lines
      .map((line) => this.parseLead(line))
      .filter((record): record is MarketingLeadRecord => !!record)
      .reverse();

    const normalizedType = options.type?.trim().toLowerCase();
    const normalizedSearch = options.search?.trim().toLowerCase();

    const filtered = records.filter((record) => {
      if (normalizedType && record.type.toLowerCase() !== normalizedType) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        record.type,
        record.name,
        record.company,
        record.email,
        record.message,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    const limit = Math.max(1, options.limit);
    const data = filtered.slice(0, limit);

    return {
      data,
      meta: {
        total: filtered.length,
        returned: data.length,
        limit,
      },
    };
  }

  private async persistLead(record: MarketingLeadRecord) {
    const filePath = this.getLeadsFilePath();

    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  private async deliverLead(record: MarketingLeadRecord) {
    const tasks = await Promise.allSettled([
      this.notify(record),
      this.forwardToWebhook(record),
    ]);

    tasks.forEach((task, index) => {
      if (task.status !== 'rejected') {
        return;
      }

      const channel = index === 0 ? 'email' : 'webhook';
      const reason =
        task.reason instanceof Error
          ? task.reason.message
          : String(task.reason);

      this.logger.error(
        `Marketing lead ${channel} delivery failed for ${record.email}: ${reason}`,
      );
    });
  }

  private async notify(record: MarketingLeadRecord) {
    const recipient = this.configService
      .get<string>('MARKETING_LEADS_EMAIL')
      ?.trim();

    if (!recipient) {
      this.logger.warn(
        'MARKETING_LEADS_EMAIL is not configured; stored lead without email notification.',
      );
      return;
    }

    await this.emailService.send({
      to: recipient,
      replyTo: record.email,
      subject: `[Marketing Lead] ${record.type} - ${record.name}`,
      text: this.formatLead(record),
    });
  }

  private async forwardToWebhook(record: MarketingLeadRecord) {
    const url = this.configService
      .get<string>('MARKETING_LEADS_WEBHOOK_URL')
      ?.trim();

    if (!url) {
      return;
    }

    const headerName =
      this.configService
        .get<string>('MARKETING_LEADS_WEBHOOK_HEADER_NAME')
        ?.trim() || 'Authorization';
    const headerValue = this.configService
      .get<string>('MARKETING_LEADS_WEBHOOK_HEADER_VALUE')
      ?.trim();
    const timeoutMs = this.getWebhookTimeoutMs();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Suuq-Lead-Source':
        this.configService.get<string>('SITE_URL')?.trim() || 'marketing-site',
    };

    if (headerValue) {
      headers[headerName] = headerValue;
    }

    const response = await axios.post(
      url,
      {
        source: headers['X-Suuq-Lead-Source'],
        lead: record,
      },
      {
        headers,
        timeout: timeoutMs,
        validateStatus: () => true,
      },
    );

    if (response.status >= 400) {
      throw new Error(`Webhook responded with HTTP ${response.status}`);
    }
  }

  private getLeadsFilePath() {
    return (
      this.configService.get<string>('MARKETING_LEADS_FILE') ||
      '/var/lib/suuq-backend/marketing-leads.jsonl'
    );
  }

  private async readLeadLines(filePath: string) {
    try {
      const contents = await readFile(filePath, 'utf8');
      return contents.split('\n').filter((line) => line.trim().length > 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  private parseLead(line: string) {
    try {
      return JSON.parse(line) as MarketingLeadRecord;
    } catch {
      this.logger.warn('Skipping malformed marketing lead record during read.');
      return null;
    }
  }

  private getWebhookTimeoutMs() {
    const configured = Number(
      this.configService.get<string>('MARKETING_LEADS_WEBHOOK_TIMEOUT_MS') ||
        '5000',
    );

    if (!Number.isFinite(configured) || configured <= 0) {
      return 5000;
    }

    return configured;
  }

  private formatLead(record: MarketingLeadRecord) {
    return [
      `Submitted at: ${record.submittedAt}`,
      `Type: ${record.type}`,
      `Language: ${record.language}`,
      `Name: ${record.name}`,
      `Company: ${record.company || '-'}`,
      `Email: ${record.email}`,
      `IP: ${record.ip || '-'}`,
      `Referer: ${record.referer || '-'}`,
      `User-Agent: ${record.userAgent || '-'}`,
      '',
      record.message,
    ].join('\n');
  }
}
