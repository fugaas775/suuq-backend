import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import * as nodemailer from 'nodemailer';

// Mock Queue
const queueMock = {
  add: jest.fn(),
};

// Mock ConfigService
const configServiceMock = {
  get: jest.fn((key: string) => {
    if (key === 'EMAIL_HOST') return 'smtp.example.com';
    if (key === 'EMAIL_USER') return 'user';
    if (key === 'EMAIL_PASS') return 'pass';
    if (key === 'EMAIL_VERIFY_ON_STARTUP') return 'true';
    return null;
  }),
};

// Mock nodemailer
jest.mock('nodemailer');
const sendMailMock = jest.fn().mockResolvedValue({ messageId: '123' });
const verifyMock = jest.fn().mockResolvedValue(true);
(nodemailer.createTransport as jest.Mock).mockReturnValue({
  sendMail: sendMailMock,
  verify: verifyMock,
});

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: getQueueToken('emails'), useValue: queueMock },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('send() should add job to queue', async () => {
    const mail = { to: 'test@example.com', subject: 'Test' };
    await service.send(mail);
    expect(queueMock.add).toHaveBeenCalledWith('send-email', mail, expect.anything());
  });

  it('sendInternal() should use nodemailer to send email', async () => {
    // Wait a bit for verify promise to settle in constructor if any
    await new Promise(process.nextTick); 
    
    const mail = { to: 'test@example.com', subject: 'Test' };
    await service.sendInternal(mail);
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'test@example.com',
      subject: 'Test',
    }));
  });
});
