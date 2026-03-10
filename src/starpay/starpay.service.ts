import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosError, AxiosInstance, Method } from 'axios';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { starpayConfig } from './starpay.config';
import {
  CreateBillDto,
  CreateServiceDto,
  GenerateDynamicQrDto,
  InitiateBankPaymentDto,
  InitiateWalletPaymentDto,
  StarpayApiResponseDto,
  StarpayWebhookDto,
  StarpayHistoryQueryDto,
  StarpayReportQueryDto,
  VerifyPaymentDto,
} from './starpay.dto';
import { verifyStarpaySignature } from './signature';
import { OrdersService } from '../orders/orders.service';
import { Order, PaymentStatus } from '../orders/entities/order.entity';
import { PaymentLog } from '../payments/entities/payment-log.entity';

type StarpayClientMethod<TRequest, TResponse> = (
  payload: TRequest,
) => Promise<TResponse>;

type StarpayGatewayClient = {
  verifyPayment: StarpayClientMethod<VerifyPaymentDto, StarpayApiResponseDto>;
  initiateBankPayment: StarpayClientMethod<
    InitiateBankPaymentDto,
    StarpayApiResponseDto
  >;
  initiateWalletPayment: StarpayClientMethod<
    InitiateWalletPaymentDto,
    StarpayApiResponseDto
  >;
  generateDynamicQR: StarpayClientMethod<
    GenerateDynamicQrDto,
    StarpayApiResponseDto
  >;
  createService: StarpayClientMethod<CreateServiceDto, StarpayApiResponseDto>;
  createBill: StarpayClientMethod<CreateBillDto, StarpayApiResponseDto>;
  getEodReport: StarpayClientMethod<
    StarpayReportQueryDto,
    StarpayApiResponseDto
  >;
  getBalanceHistory: StarpayClientMethod<
    StarpayHistoryQueryDto,
    StarpayApiResponseDto
  >;
  getSettlementTransactions: StarpayClientMethod<
    StarpayHistoryQueryDto,
    StarpayApiResponseDto
  >;
};

type RequestOperation =
  | 'verifyPayment'
  | 'initiateBankPayment'
  | 'initiateWalletPayment'
  | 'generateDynamicQR'
  | 'createService'
  | 'createBill'
  | 'getEodReport'
  | 'getBalanceHistory'
  | 'getSettlementTransactions';

type QueryRecord = Record<string, string | number | boolean | undefined>;
type RequestPayload = object;

class StarpayRestClient implements StarpayGatewayClient {
  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly logger: Logger,
  ) {}

  verifyPayment(payload: VerifyPaymentDto) {
    return this.request(
      'verifyPayment',
      'post',
      starpayConfig.endpoints.verifyPayment,
      payload,
    ) as Promise<StarpayApiResponseDto>;
  }

  initiateBankPayment(payload: InitiateBankPaymentDto) {
    return this.request(
      'initiateBankPayment',
      'post',
      starpayConfig.endpoints.bankPayment,
      payload,
    ) as Promise<StarpayApiResponseDto>;
  }

  initiateWalletPayment(payload: InitiateWalletPaymentDto) {
    return this.request(
      'initiateWalletPayment',
      'post',
      starpayConfig.endpoints.walletPayment,
      payload,
    ) as Promise<StarpayApiResponseDto>;
  }

  generateDynamicQR(payload: GenerateDynamicQrDto) {
    return this.request(
      'generateDynamicQR',
      'post',
      starpayConfig.endpoints.dynamicQr,
      payload,
    ) as Promise<StarpayApiResponseDto>;
  }

  createService(payload: CreateServiceDto) {
    return this.request(
      'createService',
      'post',
      starpayConfig.endpoints.createService,
      payload,
    ) as Promise<StarpayApiResponseDto>;
  }

  createBill(payload: CreateBillDto) {
    return this.request(
      'createBill',
      'post',
      starpayConfig.endpoints.createBill,
      payload,
    ) as Promise<StarpayApiResponseDto>;
  }

  getEodReport(payload: StarpayReportQueryDto) {
    return this.request(
      'getEodReport',
      'get',
      starpayConfig.endpoints.eodReport,
      payload,
    ) as Promise<StarpayApiResponseDto>;
  }

  getBalanceHistory(payload: StarpayHistoryQueryDto) {
    return this.request(
      'getBalanceHistory',
      'get',
      starpayConfig.endpoints.balanceHistory,
      payload,
    ) as Promise<StarpayApiResponseDto>;
  }

  getSettlementTransactions(payload: StarpayHistoryQueryDto) {
    return this.request(
      'getSettlementTransactions',
      'get',
      starpayConfig.endpoints.settlements,
      payload,
    ) as Promise<StarpayApiResponseDto>;
  }

  private async request(
    operation: RequestOperation,
    method: Method,
    endpoint: string,
    payload: QueryRecord | RequestPayload,
  ): Promise<unknown> {
    this.logger.debug(
      `StarPay ${operation} request: ${JSON.stringify(
        this.redactForLogs(payload),
      )}`,
    );

    const response = await this.httpClient.request({
      method,
      url: endpoint,
      data: method === 'get' ? undefined : payload,
      params: method === 'get' ? payload : undefined,
    });

    return response.data;
  }

  private redactForLogs(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactForLogs(item));
    }

    if (value && typeof value === 'object') {
      const redacted: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (
          key.toLowerCase().includes('otp') ||
          key.toLowerCase().includes('ussd') ||
          key.toLowerCase().includes('secret')
        ) {
          redacted[key] = '[REDACTED]';
          continue;
        }

        redacted[key] = this.redactForLogs(nestedValue);
      }
      return redacted;
    }

    return value;
  }
}

@Injectable()
export class StarpayService {
  private readonly logger = new Logger(StarpayService.name);
  private clientPromise: Promise<StarpayGatewayClient> | null = null;

  constructor(
    private readonly ordersService: OrdersService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(PaymentLog)
    private readonly paymentLogRepository: Repository<PaymentLog>,
  ) {}

  async verifyPayment(payload: VerifyPaymentDto) {
    const response = await this.execute('verifyPayment', payload, (client) =>
      client.verifyPayment(payload),
    );

    await this.tryCompleteOrderFromGatewayResponse(response);
    return response;
  }

  async initiateBankPayment(payload: InitiateBankPaymentDto) {
    this.assertSandboxPhoneAllowed(payload.customerPhone);
    return this.execute('initiateBankPayment', payload, (client) =>
      client.initiateBankPayment(payload),
    );
  }

  async initiateWalletPayment(payload: InitiateWalletPaymentDto) {
    this.assertSandboxPhoneAllowed(payload.customerPhone);
    return this.execute('initiateWalletPayment', payload, (client) =>
      client.initiateWalletPayment(payload),
    );
  }

  async generateDynamicQR(payload: GenerateDynamicQrDto) {
    return this.execute('generateDynamicQR', payload, (client) =>
      client.generateDynamicQR(payload),
    );
  }

  async createService(payload: CreateServiceDto) {
    return this.execute('createService', payload, (client) =>
      client.createService(payload),
    );
  }

  async createBill(payload: CreateBillDto) {
    return this.execute('createBill', payload, (client) =>
      client.createBill(payload),
    );
  }

  async getEodReport(payload: StarpayReportQueryDto) {
    return this.execute('getEodReport', payload, (client) =>
      client.getEodReport(payload),
    );
  }

  async getBalanceHistory(payload: StarpayHistoryQueryDto) {
    return this.execute('getBalanceHistory', payload, (client) =>
      client.getBalanceHistory(payload),
    );
  }

  async getSettlementTransactions(payload: StarpayHistoryQueryDto) {
    return this.execute('getSettlementTransactions', payload, (client) =>
      client.getSettlementTransactions(payload),
    );
  }

  async handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    payload: StarpayWebhookDto | Record<string, unknown>,
  ) {
    this.assertConfigured();

    const signatureHeader = this.normalizeHeaderValue(
      headers[starpayConfig.signatureHeaderName],
    );
    const timestampHeader = this.normalizeHeaderValue(
      headers[starpayConfig.timestampHeaderName],
    );
    const orderId = this.extractOrderId(payload as Record<string, unknown>);
    const paymentLog = await this.createPaymentLog({
      orderId,
      headers,
      webhookTimestamp: timestampHeader,
      payload,
      processingStatus: 'RECEIVED',
      signatureValid: null,
    });
    const verification = verifyStarpaySignature({
      payload,
      signature: signatureHeader,
      timestamp: timestampHeader,
      secret: starpayConfig.callbackSecret,
      toleranceMs: starpayConfig.webhookToleranceMs,
    });

    if (!verification.ok) {
      await this.updatePaymentLog(paymentLog, {
        signatureValid: false,
        processingStatus: 'REJECTED_INVALID_SIGNATURE',
        processingMeta: {
          reason: verification.reason,
        },
      });
      throw new UnauthorizedException({
        message: 'Invalid StarPay webhook signature.',
        provider: 'STARPAY',
        reason: verification.reason,
      });
    }

    await this.updatePaymentLog(paymentLog, {
      signatureValid: true,
      processingStatus: 'AUTHORIZED',
    });

    if (orderId) {
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
        select: ['id', 'paymentStatus'],
      });

      if (order?.paymentStatus === PaymentStatus.PAID) {
        await this.updatePaymentLog(paymentLog, {
          processingStatus: 'IGNORED_ALREADY_PAID',
          processingMeta: {
            idempotent: true,
            orderId,
          },
        });

        return {
          status: 'OK',
          message: 'StarPay webhook already processed',
          timestamp: new Date().toISOString(),
          data: {
            orderId: String(orderId),
            alreadyPaid: true,
          },
        };
      }
    }

    this.logger.log(
      `Received StarPay webhook: ${JSON.stringify(this.redactForLogs(payload))}`,
    );
    await this.tryCompleteOrderFromGatewayResponse(payload);

    await this.updatePaymentLog(paymentLog, {
      processingStatus: 'PROCESSED',
      processingMeta: {
        orderId,
      },
    });

    return {
      status: 'OK',
      message: 'StarPay webhook accepted',
      timestamp: new Date().toISOString(),
      data: null,
    };
  }

  async createPaymentLog(params: {
    orderId: number | null;
    headers: Record<string, string | string[] | undefined>;
    webhookTimestamp: string | null;
    payload: unknown;
    processingStatus: string;
    signatureValid: boolean | null;
  }): Promise<PaymentLog> {
    const log = this.paymentLogRepository.create({
      provider: 'STARPAY',
      channel: 'WEBHOOK',
      orderId: params.orderId ? String(params.orderId) : null,
      eventType: this.extractStatus(params.payload as Record<string, unknown>),
      processingStatus: params.processingStatus,
      signatureValid: params.signatureValid,
      webhookTimestamp: params.webhookTimestamp,
      requestHeaders: this.sanitizeHeaders(params.headers),
      rawPayload: (params.payload || {}) as Record<string, unknown>,
      processingMeta: null,
    });

    return this.paymentLogRepository.save(log);
  }

  private async execute<TPayload>(
    operation: RequestOperation,
    payload: TPayload,
    callback: (client: StarpayGatewayClient) => Promise<StarpayApiResponseDto>,
  ) {
    this.assertConfigured();

    try {
      const client = await this.getClient();
      return await callback(client);
    } catch (error) {
      throw this.mapGatewayError(operation, error, payload);
    }
  }

  private assertConfigured(): void {
    const missing = [
      ['STARPAY_MERCHANT_NAME', starpayConfig.merchantName],
      ['STARPAY_MERCHANT_ID', starpayConfig.merchantId],
      ['STARPAY_SECRET_KEY', starpayConfig.secretKey],
      ['STARPAY_BASE_URL', starpayConfig.baseUrl],
      ['CALLBACK_SECRET', starpayConfig.callbackSecret],
    ]
      .filter(([key, value]) =>
        key === 'CALLBACK_SECRET' ? false : !String(value || '').trim(),
      )
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new InternalServerErrorException(
        `StarPay configuration is incomplete: ${missing.join(', ')}`,
      );
    }
  }

  private async getClient(): Promise<StarpayGatewayClient> {
    if (this.clientPromise === null) {
      this.clientPromise = this.createClient();
    }

    return this.clientPromise;
  }

  private async createClient(): Promise<StarpayGatewayClient> {
    if (starpayConfig.sdkModule) {
      return this.createSdkClient();
    }

    return new StarpayRestClient(this.createHttpClient(), this.logger);
  }

  private createHttpClient(): AxiosInstance {
    return axios.create({
      baseURL: starpayConfig.baseUrl,
      timeout: starpayConfig.timeoutMs,
      headers: this.buildHeaders(),
    });
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Request-Id': randomUUID(),
    };

    if (starpayConfig.merchantId) {
      headers[starpayConfig.merchantIdHeaderName] = starpayConfig.merchantId;
    }

    if (starpayConfig.merchantName) {
      headers[starpayConfig.merchantNameHeaderName] =
        starpayConfig.merchantName;
    }

    if (starpayConfig.secretKey) {
      if (starpayConfig.authMode === 'x-api-key') {
        headers[starpayConfig.secretHeaderName] = starpayConfig.secretKey;
      } else {
        headers.Authorization = `${starpayConfig.authScheme} ${starpayConfig.secretKey}`;
      }
    }

    return headers;
  }

  private async createSdkClient(): Promise<StarpayGatewayClient> {
    try {
      const importedModule = await import(starpayConfig.sdkModule);
      const exported =
        starpayConfig.sdkExportName === 'default'
          ? importedModule.default
          : importedModule[starpayConfig.sdkExportName];

      if (!exported) {
        throw new Error(
          `StarPay SDK export "${starpayConfig.sdkExportName}" was not found.`,
        );
      }

      const sdkClient = this.instantiateSdkClient(exported);
      return this.wrapSdkClient(sdkClient);
    } catch (error) {
      this.logger.error(
        `Failed to initialize StarPay SDK client: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'StarPay SDK initialization failed',
      );
    }
  }

  private instantiateSdkClient(exported: unknown): unknown {
    const sdkConfig = {
      merchantName: starpayConfig.merchantName,
      merchantId: starpayConfig.merchantId,
      secretKey: starpayConfig.secretKey,
      baseUrl: starpayConfig.baseUrl,
      timeoutMs: starpayConfig.timeoutMs,
      endpoints: starpayConfig.endpoints,
    };

    if (typeof exported === 'function') {
      try {
        return new (exported as new (config: typeof sdkConfig) => unknown)(
          sdkConfig,
        );
      } catch {
        return (exported as (config: typeof sdkConfig) => unknown)(sdkConfig);
      }
    }

    if (typeof exported === 'object' && exported !== null) {
      return exported;
    }

    throw new Error('Unsupported StarPay SDK export type.');
  }

  private wrapSdkClient(client: unknown): StarpayGatewayClient {
    const typedClient = client as Partial<StarpayGatewayClient>;
    const requiredMethods: Array<keyof StarpayGatewayClient> = [
      'verifyPayment',
      'initiateBankPayment',
      'initiateWalletPayment',
      'generateDynamicQR',
      'createService',
      'createBill',
      'getEodReport',
      'getBalanceHistory',
      'getSettlementTransactions',
    ];

    for (const methodName of requiredMethods) {
      if (typeof typedClient[methodName] !== 'function') {
        throw new Error(`StarPay SDK is missing method ${methodName}.`);
      }
    }

    return typedClient as StarpayGatewayClient;
  }

  private mapGatewayError(
    operation: RequestOperation,
    error: unknown,
    payload: unknown,
  ) {
    if (error instanceof BadRequestException) {
      return error;
    }

    if (error instanceof InternalServerErrorException) {
      return error;
    }

    if (error instanceof ServiceUnavailableException) {
      return error;
    }

    const axiosError = error as AxiosError<Record<string, unknown>>;
    const providerPayload = axiosError.response?.data || {};
    const providerMessage = String(
      providerPayload.message ||
        providerPayload.error ||
        providerPayload.responseMessage ||
        axiosError.message ||
        'Unknown StarPay error',
    );
    const providerCode = String(
      providerPayload.code || providerPayload.errorCode || '',
    ).trim();
    const lowerMessage = providerMessage.toLowerCase();

    this.logger.error(
      `StarPay ${operation} failed | status=${axiosError.response?.status || 'n/a'} code=${providerCode || 'n/a'} message=${providerMessage} payload=${JSON.stringify(
        this.redactForLogs(payload),
      )}`,
    );

    if (
      operation === 'initiateBankPayment' &&
      (lowerMessage.includes('otp') || providerCode === 'OTP_FAILED')
    ) {
      return new BadRequestException({
        message: 'StarPay bank OTP verification failed.',
        provider: 'STARPAY',
        providerCode: providerCode || null,
      });
    }

    if (
      operation === 'initiateWalletPayment' &&
      (lowerMessage.includes('ussd') || providerCode === 'USSD_FAILED')
    ) {
      return new BadRequestException({
        message: 'StarPay wallet USSD session failed or expired.',
        provider: 'STARPAY',
        providerCode: providerCode || null,
      });
    }

    if (
      axiosError.response?.status === 401 ||
      axiosError.response?.status === 403
    ) {
      return new ServiceUnavailableException({
        message: 'StarPay authentication failed. Check merchant credentials.',
        provider: 'STARPAY',
      });
    }

    if (axiosError.response?.status === 404) {
      return new NotFoundException({
        message: 'StarPay resource not found.',
        provider: 'STARPAY',
        providerCode: providerCode || null,
      });
    }

    if (
      axiosError.response?.status &&
      axiosError.response.status >= 400 &&
      axiosError.response.status < 500
    ) {
      return new BadRequestException({
        message: providerMessage,
        provider: 'STARPAY',
        providerCode: providerCode || null,
      });
    }

    return new ServiceUnavailableException({
      message:
        'StarPay request failed. Review gateway reachability and credentials.',
      provider: 'STARPAY',
      providerCode: providerCode || null,
    });
  }

  private redactForLogs(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactForLogs(item));
    }

    if (value && typeof value === 'object') {
      const redacted: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (
          key.toLowerCase().includes('otp') ||
          key.toLowerCase().includes('ussd') ||
          key.toLowerCase().includes('secret')
        ) {
          redacted[key] = '[REDACTED]';
          continue;
        }

        redacted[key] = this.redactForLogs(nestedValue);
      }
      return redacted;
    }

    return value;
  }

  private normalizeHeaderValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) {
      return String(value[0] || '').trim();
    }

    return String(value || '').trim();
  }

  private assertSandboxPhoneAllowed(phone: string): void {
    const normalizedPhone = String(phone || '').trim();
    if (
      normalizedPhone === starpayConfig.sandboxTestMsisdn &&
      !starpayConfig.sandboxMode
    ) {
      throw new BadRequestException(
        'StarPay sandbox test MSISDN is only allowed when sandbox mode is enabled.',
      );
    }
  }

  private async tryCompleteOrderFromGatewayResponse(payload: unknown) {
    const record = payload as Record<string, unknown>;
    const orderId = this.extractOrderId(record);
    const status = this.extractStatus(record);

    if (!orderId || !this.isSuccessfulStatus(status)) {
      return;
    }

    try {
      await this.ordersService.completeOrderFromPaymentCallback(orderId);
    } catch (error) {
      this.logger.error(
        `StarPay callback could not complete order ${orderId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  private async updatePaymentLog(
    paymentLog: PaymentLog,
    update: Partial<PaymentLog>,
  ): Promise<void> {
    Object.assign(paymentLog, update);
    await this.paymentLogRepository.save(paymentLog);
  }

  private extractOrderId(payload: Record<string, unknown> | null | undefined) {
    const fromRoot = String(payload?.orderId || '').trim();
    if (/^\d+$/.test(fromRoot)) {
      return Number.parseInt(fromRoot, 10);
    }

    const data = payload?.data as Record<string, unknown> | undefined;
    const fromData = String(data?.orderId || data?.referenceId || '').trim();
    if (/^\d+$/.test(fromData)) {
      return Number.parseInt(fromData, 10);
    }

    const refLike = String(
      payload?.referenceId || data?.referenceId || data?.orderReference || '',
    ).trim();
    const refMatch = refLike.match(/(?:REF-|ORDER-|INV-)?(\d+)/i);
    if (refMatch) {
      return Number.parseInt(refMatch[1], 10);
    }

    return null;
  }

  private extractStatus(payload: Record<string, unknown> | null | undefined) {
    return String(
      payload?.status ||
        payload?.message ||
        (payload?.data as Record<string, unknown> | undefined)?.status ||
        '',
    )
      .trim()
      .toLowerCase();
  }

  private isSuccessfulStatus(status: string): boolean {
    return ['paid', 'success', 'successful', 'verified', 'completed'].includes(
      status,
    );
  }

  private sanitizeHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(headers || {})) {
      if (key.toLowerCase() === 'authorization') {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      sanitized[key] = Array.isArray(value) ? value[0] : value;
    }

    return sanitized;
  }
}
