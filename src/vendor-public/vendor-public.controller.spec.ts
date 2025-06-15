import { Test, TestingModule } from '@nestjs/testing';
import { VendorPublicController } from './vendor-public.controller';

describe('VendorPublicController', () => {
  let controller: VendorPublicController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorPublicController],
    }).compile();

    controller = module.get<VendorPublicController>(VendorPublicController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
