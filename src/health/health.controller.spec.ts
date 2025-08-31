import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  const mockHealthService = {
    checkHealth: jest.fn(),
    checkReadiness: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: mockHealthService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth', () => {
    it('should return health status', async () => {
      const mockHealth = {
        status: 'ok',
        timestamp: '2023-01-01T00:00:00.000Z',
        uptime: 100,
        version: '1.0.0',
      };

      mockHealthService.checkHealth.mockResolvedValue(mockHealth);

      const result = await controller.getHealth();
      expect(result).toEqual(mockHealth);
      expect(service.checkHealth).toHaveBeenCalledTimes(1);
    });
  });

  describe('getReadiness', () => {
    it('should return readiness status', async () => {
      const mockReadiness = {
        status: 'ok',
        timestamp: '2023-01-01T00:00:00.000Z',
        checks: {
          database: { status: 'ok' },
        },
      };

      mockHealthService.checkReadiness.mockResolvedValue(mockReadiness);

      const result = await controller.getReadiness();
      expect(result).toEqual(mockReadiness);
      expect(service.checkReadiness).toHaveBeenCalledTimes(1);
    });
  });
});