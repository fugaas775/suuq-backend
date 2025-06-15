import { Test, TestingModule } from '@nestjs/testing';
import { VendorPublicService } from './vendor-public.service';

describe('VendorPublicService', () => {
  let service: VendorPublicService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VendorPublicService],
    }).compile();

    service = module.get<VendorPublicService>(VendorPublicService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
