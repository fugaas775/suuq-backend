import { Test, TestingModule } from '@nestjs/testing';
import { VendorDashboardController } from './vendor-dashboard.controller';

describe('VendorDashboardController', () => {
  let controller: VendorDashboardController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorDashboardController],
    }).compile();

    controller = module.get<VendorDashboardController>(
      VendorDashboardController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
