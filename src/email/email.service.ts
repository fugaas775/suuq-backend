import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('EMAIL_HOST'),
      port: 587, // or 465
      secure: false, // true for 465, false for other ports
      auth: {
        user: this.configService.get('EMAIL_USER'),
        pass: this.configService.get('EMAIL_PASS'),
      },
    });
  }

  async sendPasswordResetEmail(to: string, token: string) {
    const resetLink = `${this.configService.get('ADMIN_URL')}/reset-password?token=${token}`;

    await this.transporter.sendMail({
      from: '"Suuq Marketplace" <no-reply@suuq.com>',
      to,
      subject: 'Your Password Reset Request',
      html: `<p>You requested a password reset. Click this link to reset it: <a href="${resetLink}">${resetLink}</a></p>`,
    });
  }
}
