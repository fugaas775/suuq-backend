import { Test, TestingModule } from '@nestjs/testing';
import { CreditService } from '../credit/credit.service';
import { AdminCreditController } from './credit.admin.controller';

describe('AdminCreditController', () => {
  let controller: AdminCreditController;
  let creditService: {
    findAllLimits: jest.Mock;
    setLimit: jest.Mock;
    repayCredit: jest.Mock;
    getTransactions: jest.Mock;
    deleteCreditLimit: jest.Mock;
  };

  beforeEach(async () => {
    creditService = {
      findAllLimits: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      setLimit: jest.fn(),
      repayCredit: jest.fn(),
      getTransactions: jest.fn(),
      deleteCreditLimit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminCreditController],
      providers: [{ provide: CreditService, useValue: creditService }],
    }).compile();

    controller = module.get(AdminCreditController);
  });

  it('forwards validated credit list filters', async () => {
    await controller.getUsers({ page: 2, limit: 30, search: 'acme' });

    expect(creditService.findAllLimits).toHaveBeenCalledWith(2, 30, 'acme');
  });
});
