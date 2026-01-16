import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import * as nodemailer from 'nodemailer';

@Processor('emails')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<nodemailer.SendMailOptions>): Promise<any> {
    switch (job.name) {
      case 'send-email':
        this.logger.debug(`Processing email job ${job.id} to ${job.data.to}`);
        try {
            await this.emailService.sendInternal(job.data);
            return { success: true };
        } catch (error) {
            this.logger.error(`Failed to send email to ${job.data.to}`, error);
            throw error;
        }
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
