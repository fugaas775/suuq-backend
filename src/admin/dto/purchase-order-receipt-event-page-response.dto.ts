import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrderReceiptEventResponseDto } from '../../purchase-orders/dto/purchase-order-receipt-event-response.dto';

export class PurchaseOrderReceiptEventPageResponseDto {
  @ApiProperty({ type: [PurchaseOrderReceiptEventResponseDto] })
  items!: PurchaseOrderReceiptEventResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
