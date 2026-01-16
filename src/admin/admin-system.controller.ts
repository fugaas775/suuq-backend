import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EmailService } from '../email/email.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';

@Controller('admin/system')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AdminSystemController {
  constructor(
    @InjectQueue('emails') private readonly emailQueue: Queue,
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
    private readonly emailService: EmailService,
  ) {}

  @Get('queues')
  async getQueueStats() {
    const [emailCounts, notifCounts] = await Promise.all([
      this.emailQueue.getJobCounts(),
      this.notificationQueue.getJobCounts(),
    ]);

    return {
      emails: emailCounts,
      notifications: notifCounts,
    };
  }

  @Post('email-test')
  async sendTestEmail(@Body('email') email: string) {
    await this.emailService.send({
      to: email,
      subject: 'Suuq System Test Email',
      text: 'This is a test email triggered from the Suuq Admin Panel.',
      html: '<p>This is a test email triggered from the <b>Suuq Admin Panel</b>.</p>',
    });
    return { success: true, message: 'Test email queued' };
  }
}
