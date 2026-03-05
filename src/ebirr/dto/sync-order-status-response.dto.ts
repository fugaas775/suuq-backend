import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, PaymentStatus } from '../../orders/entities/order.entity';

export class EbirrSyncTransactionDto {
  @ApiProperty({ example: 'INITIATED' })
  status!: string;

  @ApiProperty({ example: 'REF-123' })
  referenceId!: string;

  @ApiProperty({ example: 'INV-123', nullable: true })
  invoiceId!: string | null;

  @ApiProperty({ example: 'Suuq_6a32...', nullable: true })
  requestId!: string | null;

  @ApiProperty({ example: 'TXN-123', nullable: true })
  transactionId!: string | null;

  @ApiProperty({ example: 'ISS-123', nullable: true })
  issuerTransactionId!: string | null;

  @ApiProperty({ example: '0', nullable: true })
  responseCode!: string | null;

  @ApiProperty({ example: 'Accepted', nullable: true })
  responseMessage!: string | null;

  @ApiProperty({ example: '2026-03-02T08:10:00.000Z', nullable: true })
  updatedAt!: Date | null;
}

export class SyncOrderStatusResponseDto {
  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.UNPAID })
  paymentStatus!: PaymentStatus;

  @ApiProperty({ example: 'PENDING', enum: ['PAID', 'PENDING'] })
  status!: 'PAID' | 'PENDING';

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.PENDING })
  orderStatus!: OrderStatus;

  @ApiProperty({ example: 'EBIRR' })
  provider!: 'EBIRR';

  @ApiProperty({
    enum: ['CREATED', 'INITIATED', 'RECONCILING', 'PAID', 'FAILED'],
    example: 'INITIATED',
  })
  paymentLifecycleState!:
    | 'CREATED'
    | 'INITIATED'
    | 'RECONCILING'
    | 'PAID'
    | 'FAILED';

  @ApiProperty({ type: () => EbirrSyncTransactionDto, nullable: true })
  transaction!: EbirrSyncTransactionDto | null;
}
