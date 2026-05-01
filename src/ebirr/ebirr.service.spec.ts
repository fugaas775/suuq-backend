import axios from 'axios';
import { EbirrService } from './ebirr.service';
import { ebirrConfig } from './ebirr.config';

jest.mock('axios');

describe('EbirrService', () => {
  let service: EbirrService;

  const ebirrTransactionRepo = {
    create: jest.fn((value) => ({ id: value.id ?? 1, ...value })),
    save: jest.fn(async (value) => value),
    findOne: jest.fn(),
    count: jest.fn(),
    find: jest.fn(),
  };

  const orderRepo = {
    findOne: jest.fn(),
  };

  const ordersService = {
    completeOrderFromPaymentCallback: jest.fn(),
  };

  const redisService = {
    getClient: jest.fn(() => null),
  };

  const currencyService = {};

  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.resetAllMocks();

    service = new EbirrService(
      ebirrTransactionRepo as any,
      orderRepo as any,
      ordersService as any,
      redisService as any,
      currencyService as any,
    );

    process.env.API_URL = 'https://api.example.test';
    process.env.EBIRR_USE_CALLBACK = 'true';
    ebirrConfig.baseUrl = 'https://testpayments.ebirr.com/asm';
    ebirrConfig.apiKey = 'api-key';
    ebirrConfig.apiUserId = 'api-user';
    ebirrConfig.merchantUid = 'merchant-1';
    ebirrConfig.customerPrefix = '';
    ebirrConfig.paymentMethod = 'MWALLET_ACCOUNT';

    ebirrTransactionRepo.create.mockImplementation((value) => ({
      id: value.id ?? 1,
      ...value,
    }));
    ebirrTransactionRepo.save.mockImplementation(async (value) => value);
    ebirrTransactionRepo.findOne.mockReset();
    ebirrTransactionRepo.count.mockResolvedValue(1);
    orderRepo.findOne.mockResolvedValue(null);
    ordersService.completeOrderFromPaymentCallback.mockResolvedValue(undefined);
    mockedAxios.post.mockReset();
  });

  it('marks APPROVED callback payloads as completed', async () => {
    ebirrTransactionRepo.findOne.mockResolvedValue({
      id: 7,
      merch_order_id: 'POSBRANCH-31-1731100000000',
      invoiceId: 'POSBRANCHINV-31',
      status: 'PENDING',
      raw_response_payload: {},
    });

    const result = await service.processCallback({
      referenceId: 'POSBRANCH-31-1731100000000',
      responseCode: '2001',
      errorCode: '0',
      responseMsg: 'RCS_SUCCESS',
      params: {
        state: 'APPROVED',
      },
      transactionId: 'txn-1',
      issuerTransactionId: 'issuer-1',
    });

    expect(result).toMatchObject({
      referenceId: 'POSBRANCH-31-1731100000000',
      status: 'COMPLETED',
      invoiceId: 'POSBRANCHINV-31',
    });
    expect(ebirrTransactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED',
        trans_id: 'txn-1',
        issuer_trans_id: 'issuer-1',
      }),
    );
  });

  it('keeps E102051 initiate-payment responses reconcilable', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        responseCode: '52061',
        errorCode: 'E102051',
        responseMsg: 'Transaction TIMEOUT (Gateway Timeout Error)',
      },
    } as any);

    await expect(
      service.initiatePayment({
        phoneNumber: '0911223344',
        amount: '1900.00',
        referenceId: 'POSBRANCH-31-1731100000000',
        invoiceId: 'POSBRANCHINV-31',
        description: 'Additional POS branch',
      }),
    ).rejects.toMatchObject({
      isHandled: true,
      isEbirrTimeout: true,
      providerCode: 'E102051',
      referenceId: 'POSBRANCH-31-1731100000000',
    });

    expect(ebirrTransactionRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        merch_order_id: 'POSBRANCH-31-1731100000000',
        status: 'PENDING',
        response_code: 'E102051',
        response_msg: 'Transaction TIMEOUT (Gateway Timeout Error)',
      }),
    );
  });

  it('does not expire pending POS branch timeouts during cron cleanup', async () => {
    ebirrTransactionRepo.find
      .mockResolvedValueOnce([
        {
          id: 9,
          merch_order_id: 'POSBRANCH-11-1863-1777471631425',
          status: 'PENDING',
          response_code: 'E102051',
          raw_response_payload: {
            errorCode: 'E102051',
          },
          created_at: new Date(Date.now() - 20 * 60 * 1000),
          updated_at: new Date(Date.now() - 11 * 60 * 1000),
        },
      ])
      .mockResolvedValueOnce([]);

    await service.checkPendingTransactions();

    expect(ebirrTransactionRepo.save).not.toHaveBeenCalled();
  });

  it('treats socket hang up as recoverable and keeps transaction PENDING', async () => {
    const hangUpError: any = new Error('socket hang up');
    hangUpError.isAxiosError = true;
    hangUpError.code = 'ECONNRESET';
    // Make axios.isAxiosError return true for this error
    mockedAxios.isAxiosError = jest.fn(() => true) as any;
    mockedAxios.post.mockRejectedValueOnce(hangUpError);

    await expect(
      service.initiatePayment({
        phoneNumber: '0915333513',
        amount: '1900.00',
        referenceId: 'POSBRANCH-11-1863-1777472475351',
        invoiceId: 'POSBRANCHINV-11-1777472475351',
        description: 'Smart Barber branch',
      }),
    ).rejects.toMatchObject({
      isHandled: true,
      isEbirrTimeout: true,
    });

    expect(ebirrTransactionRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        merch_order_id: 'POSBRANCH-11-1863-1777472475351',
        status: 'PENDING',
        response_code: 'ECONNRESET',
      }),
    );
  });

  it('does not expire socket-hang-up POS branch transactions during cron', async () => {
    ebirrTransactionRepo.find
      .mockResolvedValueOnce([
        {
          id: 12,
          merch_order_id: 'POSBRANCH-11-1863-1777472475351',
          status: 'PENDING',
          response_code: 'ECONNRESET',
          raw_response_payload: {
            message: 'socket_hang_up',
            axiosCode: 'ECONNRESET',
          },
          created_at: new Date(Date.now() - 20 * 60 * 1000),
          updated_at: new Date(Date.now() - 11 * 60 * 1000),
        },
      ])
      .mockResolvedValueOnce([]);

    await service.checkPendingTransactions();

    expect(ebirrTransactionRepo.save).not.toHaveBeenCalled();
  });

  it('still expires non-POS pending transactions after the grace window', async () => {
    ebirrTransactionRepo.find
      .mockResolvedValueOnce([
        {
          id: 10,
          merch_order_id: 'REF-507',
          status: 'PENDING',
          response_code: null,
          raw_response_payload: {},
          created_at: new Date(Date.now() - 20 * 60 * 1000),
          updated_at: new Date(Date.now() - 11 * 60 * 1000),
        },
      ])
      .mockResolvedValueOnce([]);

    await service.checkPendingTransactions();

    expect(ebirrTransactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        merch_order_id: 'REF-507',
        status: 'EXPIRED',
        response_msg: 'Transaction timed out locally',
      }),
    );
  });
});
