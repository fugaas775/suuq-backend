import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from './entities/purchase-order.entity';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepository: Repository<PurchaseOrder>,
  ) {}

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    const subtotal = dto.items.reduce(
      (sum, item) => sum + item.orderedQuantity * item.unitPrice,
      0,
    );

    const purchaseOrder = this.purchaseOrdersRepository.create({
      branchId: dto.branchId,
      supplierProfileId: dto.supplierProfileId,
      currency: dto.currency ?? 'USD',
      expectedDeliveryDate: dto.expectedDeliveryDate,
      orderNumber: `PO-${Date.now()}`,
      status: PurchaseOrderStatus.SUBMITTED,
      subtotal,
      total: subtotal,
      items: dto.items.map(
        (item) =>
          ({
            productId: item.productId,
            supplierOfferId: item.supplierOfferId,
            orderedQuantity: item.orderedQuantity,
            unitPrice: item.unitPrice,
          }) as PurchaseOrderItem,
      ),
    });

    return this.purchaseOrdersRepository.save(purchaseOrder);
  }

  async findAll(): Promise<PurchaseOrder[]> {
    return this.purchaseOrdersRepository.find({
      order: { createdAt: 'DESC' },
      relations: {
        branch: true,
        supplierProfile: true,
        items: { product: true, supplierOffer: true },
      },
    });
  }
}
