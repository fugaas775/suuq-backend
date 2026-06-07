import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import {
  ParkedOrder,
  ParkedOrderSource,
  ParkedOrderStatus,
} from './entities/parked-order.entity';
import { CreateParkedOrderDto } from './dto/parked-order.dto';

@Injectable()
export class ParkedOrdersService {
  private readonly logger = new Logger(ParkedOrdersService.name);

  constructor(
    @InjectRepository(ParkedOrder)
    private readonly parkedOrders: Repository<ParkedOrder>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(VendorStore)
    private readonly vendorStores: Repository<VendorStore>,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    dto: CreateParkedOrderDto,
    customerUserId?: number | null,
  ): Promise<ParkedOrder> {
    // Snapshot product details so the lead survives product edits/deletes.
    const product = await this.products.findOne({
      where: { id: dto.productId },
      relations: ['vendor'],
    });
    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} not found`);
    }

    const vendorId = product.vendor?.id ?? dto.vendorId;

    // Resolve branch (if the product is scoped to a branch via VendorStore).
    let branchId: number | null = null;
    if (product.vendorStoreId) {
      const store = await this.vendorStores.findOne({
        where: { id: product.vendorStoreId },
      });
      branchId = store?.branchId ?? null;
    }

    const source =
      dto.source && Object.values(ParkedOrderSource).includes(dto.source)
        ? dto.source
        : ParkedOrderSource.PRODUCT_DETAILS;

    const entity = this.parkedOrders.create({
      productId: product.id,
      productName: product.name,
      productImageUrl: product.imageUrl ?? null,
      vendorId,
      branchId,
      quantity: dto.quantity && dto.quantity > 0 ? dto.quantity : 1,
      unitPrice:
        dto.unitPrice != null ? String(dto.unitPrice) : String(product.price),
      currency: (dto.currency ?? product.currency ?? 'ETB')
        .trim()
        .toUpperCase()
        .slice(0, 3),
      attributes: dto.attributes ?? null,
      customerUserId: customerUserId ?? null,
      customerName: dto.customerName ?? null,
      customerPhone: dto.customerPhone ?? null,
      note: dto.note ?? null,
      source,
      status: ParkedOrderStatus.PARKED,
    });

    const saved = await this.parkedOrders.save(entity);

    // Fire-and-forget notification to the vendor so they can follow up fast.
    this.notifyVendor(saved).catch((err) => {
      this.logger.error(
        `Failed to notify vendor ${vendorId} of parked order ${saved.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return saved;
  }

  private async notifyVendor(order: ParkedOrder): Promise<void> {
    const who = order.customerName?.trim() || 'A customer';
    await this.notifications.createAndDispatch({
      userId: order.vendorId,
      title: 'New parked order',
      body: `${who} parked "${order.productName ?? 'a product'}" — tap to follow up.`,
      type: NotificationType.ORDER,
      data: {
        type: 'parked_order',
        id: String(order.id),
        route: `/parked-orders?id=${order.id}`,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      image: order.productImageUrl ?? undefined,
    });
  }

  async listForVendor(
    vendorId: number,
    opts: { page?: number; limit?: number; status?: string } = {},
  ): Promise<{
    items: ParkedOrder[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
    const where: Record<string, unknown> = { vendorId };
    if (opts.status && this.isStatus(opts.status)) {
      where.status = opts.status;
    }
    const [items, total] = await this.parkedOrders.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async listForBranch(
    branchId: number,
    opts: { page?: number; limit?: number; status?: string } = {},
  ): Promise<{
    items: ParkedOrder[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
    const where: Record<string, unknown> = { branchId };
    if (opts.status && this.isStatus(opts.status)) {
      where.status = opts.status;
    }
    const [items, total] = await this.parkedOrders.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async updateStatus(
    id: number,
    vendorId: number | null,
    status: string,
  ): Promise<ParkedOrder> {
    if (!this.isStatus(status)) {
      throw new NotFoundException(`Invalid status "${status}"`);
    }
    const order = await this.parkedOrders.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Parked order ${id} not found`);
    }
    // When called from the vendor surface, enforce ownership.
    if (vendorId != null && order.vendorId !== vendorId) {
      throw new NotFoundException(`Parked order ${id} not found`);
    }
    order.status = status as ParkedOrderStatus;
    return this.parkedOrders.save(order);
  }

  private isStatus(value: string): boolean {
    return Object.values(ParkedOrderStatus).includes(
      value as ParkedOrderStatus,
    );
  }
}
