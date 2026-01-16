import { Test, TestingModule } from '@nestjs/testing';
import { EmailProcessor } from './email.processor';
import { EmailService } from './email.service';
import { Job } from 'bullmq';

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let emailServiceMock: any;

  beforeEach(async () => {
    emailServiceMock = {
      sendInternal: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        { provide: EmailService, useValue: emailServiceMock },
      ],
    }).compile();

    processor = module.get<EmailProcessor>(EmailProcessor);
  });

  it('should process send-email job', async () => {
    const job = {
      name: 'send-email',
      data: { to: 'test@example.com', subject: 'Hello' },
    } as Job;

    await processor.process(job);

    expect(emailServiceMock.sendInternal).toHaveBeenCalledWith(job.data);
  });
});
