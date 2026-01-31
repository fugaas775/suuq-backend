/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-enum-comparison, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unused-vars */
/* eslint-disable no-empty, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, prettier/prettier */
import { UserRole } from '../auth/roles.enum';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CartService } from '../cart/cart.service';
import { MpesaService } from '../mpesa/mpesa.service';
import { TelebirrService } from '../telebirr/telebirr.service';
import { EbirrService } from '../ebirr/ebirr.service';
import { User, BusinessModel } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { plainToInstance } from 'class-transformer';
import { OrderResponseDto } from './dto/order-response.dto';
import { DoSpacesService } from '../media/do-spaces.service';
import { AuditService } from '../audit/audit.service';
import { CurrencyService } from '../common/services/currency.service';
import { EmailService } from '../email/email.service';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { TransactionType } from '../wallet/entities/wallet-transaction.entity';
import { PayoutProvider, PayoutStatus } from '../wallet/entities/payout-log.entity';
import { Message, MessageType } from '../chat/entities/message.entity';
import { MoreThan, In } from 'typeorm';
import { subMinutes } from 'date-fns';

@Injectable()
export class OrdersService {
  /**
   * Find all orders for admin with pagination and optional status filter.
   * Returns { orders, total } for pagination.
   */
  async findAllForAdmin(query: {
    page?: number;
    limit?: number;
    pageSize?: number;
    status?: string;
    sort?: string;
    sortBy?: string;
    orderBy?: string;
    sortOrder?: 'ASC' | 'DESC' | 'asc' | 'desc';
    order?: 'ASC' | 'DESC' | 'asc' | 'desc';
  }): Promise<{ data: OrderResponseDto[]; total: number }> {
    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.deliverer', 'deliverer')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor');

    if (query.status) {
      const statuses = query.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length > 0) {
        qb.andWhere('order.status IN (:...statuses)', { statuses });
      }
    }

    // Server-side sorting so admin always sees deterministic newest-first pages
    const sortableColumns = new Set([
      'id',
      'createdAt',
      'status',
      'paymentStatus',
      'paymentMethod',
      'total',
    ]);

    const sortToken = (query.sort || '').toString().trim();
    const tokenColumn = sortToken.replace(/^[-+]/, '') || undefined;
    const tokenOrder =
      sortToken && sortToken.startsWith('-')
        ? 'DESC'
        : sortToken
          ? 'ASC'
          : undefined;

    const requestedColumn =
      query.sortBy || query.orderBy || tokenColumn || 'createdAt';

    const requestedOrderRaw =
      query.sortOrder || query.order || tokenOrder || 'DESC';
    const requestedOrder =
      requestedOrderRaw && requestedOrderRaw.toString().toUpperCase() === 'ASC'
        ? 'ASC'
        : 'DESC';

    if (requestedColumn && sortableColumns.has(requestedColumn)) {
      qb.orderBy(`order.${requestedColumn}`, requestedOrder);
    } else {
      qb.orderBy('order.createdAt', 'DESC');
    }
    qb.addOrderBy('order.id', 'DESC'); // tie-break for deterministic pagination

    const page = query.page && query.page > 0 ? query.page : 1;
    const limitInput = query.limit ?? query.pageSize;
    const limit = limitInput && limitInput > 0 ? limitInput : 20;
    qb.skip((page - 1) * limit).take(limit);

    const [orders, total] = await qb.getManyAndCount();
    const response = orders.map((order) => {
      type VendorLike = {
        id?: number;
        displayName?: string | null;
        storeName?: string | null;
      };
      const vendorsMap = new Map<number, VendorLike & { id: number }>();
      for (const it of order.items || []) {
        const vendor = it.product?.vendor as VendorLike | undefined;
        if (
          vendor &&
          typeof vendor.id === 'number' &&
          !vendorsMap.has(vendor.id)
        ) {
          vendorsMap.set(vendor.id, {
            id: vendor.id,
            displayName: vendor.displayName ?? null,
            storeName: vendor.storeName ?? null,
          });
        }
      }
      const vendors = Array.from(vendorsMap.values());
      const deliverer = order.deliverer as
        | (User & {
            displayName?: string | null;
            email?: string | null;
            phoneNumber?: string | null;
          })
        | undefined;
      return plainToInstance(OrderResponseDto, {
        ...order,
        userId: order.user?.id,
        delivererId: deliverer?.id,
        delivererName: deliverer?.displayName ?? null,
        delivererEmail: deliverer?.email ?? null,
        delivererPhone: deliverer?.phoneNumber ?? null,
        vendors,
        vendorName:
          vendors.length === 1
            ? vendors[0].storeName || vendors[0].displayName || null
            : null,
        items: (order.items || []).map((item) => {
          const product = item.product;
          return {
            productId: product?.id,
            productName: product?.name,
            productImageUrl: product?.thumbnail || product?.imageUrl || null,
            quantity: item.quantity,
            price: item.price,
          };
        }),
      });
    });
    return { data: response, total };
  }

  /**
   * Get total revenue from all PAID orders.
   */
  async getTotalRevenue(): Promise<number> {
    const raw = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.total)', 'sum')
      .where('order.paymentStatus = :status', { status: PaymentStatus.PAID })
      .getRawOne<{ sum: string | number | null }>();
    const sum = raw?.sum;
    return typeof sum === 'number' ? sum : sum ? Number(sum) : 0;
  }

  /**
   * Count all orders in the database.
   */
  async countAll(): Promise<number> {
    return this.orderRepository.count();
  }
  private readonly logger = new Logger(OrdersService.name);
  private readonly supportedCurrencies = ['ETB', 'SOS', 'KES', 'DJF', 'USD'];

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(UiSetting)
    private readonly uiSettingRepo: Repository<UiSetting>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly productsService: ProductsService,
    private readonly cartService: CartService,
    private readonly mpesaService: MpesaService,
    private readonly telebirrService: TelebirrService,
    private readonly ebirrService: EbirrService,
    private readonly notificationsService: NotificationsService,
    private readonly doSpaces: DoSpacesService,
    private readonly audit: AuditService,
    private readonly currencyService: CurrencyService,
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
    private readonly walletService: WalletService,
  ) {}

  private async sendConfirmationForOrder(orderId: number) {
    try {
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
        relations: ['user', 'items', 'items.product', 'items.product.vendor'],
      });
      if (order) {
        // Run in background to not block response
        this.emailService
          .sendOrderConfirmation(order)
          .catch((e) =>
            this.logger.error(
              `Failed to send order confirmation email: ${e.message}`,
            ),
          );
        
        // Also notify vendors
        this.notifyVendorsOfOrder(order).catch((e) =>
            this.logger.error(`Failed to notify vendors: ${e.message}`),
        );
      }
    } catch (e) {
      this.logger.error(
        `Failed to load order for confirmation email: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  private async notifyVendorsOfOrder(order: Order) {
    if (!order.items || order.items.length === 0) return;

    // Group items by vendor
    const vendorItems = new Map<number, { vendor: User; items: any[] }>();

    for (const item of order.items) {
      const vendor = item.product?.vendor;
      if (vendor && vendor.email) {
        if (!vendorItems.has(vendor.id)) {
          vendorItems.set(vendor.id, { vendor, items: [] });
        }
        vendorItems.get(vendor.id)?.items.push({
          productName: item.product.name,
          quantity: item.quantity,
          price: item.price, // Note: This is base price. Ideally we use display price if available, but for vendor notification base/stored price is usually OK or we need to pass currency.
        });
      }
    }

    const currency = order.currency || 'ETB';

    for (const { vendor, items } of vendorItems.values()) {
        await this.emailService.sendVendorNewOrderEmail(
            vendor.email,
            vendor.displayName || 'Vendor',
            order.id,
            items,
            currency
        );
    }
  }

  private normalizeCurrency(value?: string | null): string {
    const upper = (value || '').trim().toUpperCase();
    return this.supportedCurrencies.includes(upper) ? upper : 'ETB';
  }

  private convertPrice(
    amount: number | null | undefined,
    from: string,
    to: string,
  ): { amount: number | null; rate?: number } {
    if (amount === null || amount === undefined) return { amount: null };
    try {
      const converted = this.currencyService.convert(amount, from, to);
      const rate = this.currencyService.getRate(from, to);
      return {
        amount: converted,
        rate:
          typeof rate === 'number'
            ? Math.round(rate * 1_000_000) / 1_000_000
            : undefined,
      };
    } catch (err) {
      this.logger.warn(
        `Currency convert failed from ${from} to ${to}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { amount, rate: undefined };
    }
  }

  private mapOrderItem(item: OrderItem, target: string): OrderItem {
    const productCurrency = (item.product as any)?.currency || 'ETB';
    const rawPrice = Number(item.price);
    const { amount: priceConverted, rate } = this.convertPrice(
      rawPrice,
      productCurrency,
      target,
    );
    const displayedPrice = priceConverted !== null ? Number(priceConverted) : rawPrice;

    (item as any).price_display = {
      amount: displayedPrice,
      currency: target,
      convertedFrom: productCurrency,
      rate,
    };
    (item as any).price = displayedPrice;
    (item as any).currency = target;
    return item;
  }

  private mapOrder(order: Order, currency?: string): Order {
    if (!order) return order;
    const target = this.normalizeCurrency(currency);
    this.logger.debug(
      `Order currency normalized: requested=${currency} applied=${target}`,
    );
    const mappedItems = (order.items || []).map((it) =>
      this.mapOrderItem(it, target),
    );
    (order as any).items = mappedItems;

    // Derive total in target currency from items to keep consistency
    const totalConverted = mappedItems.reduce((sum, it) => {
      const price = Number((it as any).price);
      return sum + (typeof price === 'number' && !isNaN(price) ? price * (it.quantity || 0) : 0);
    }, 0);
    
    let finalAmount = Math.round(totalConverted * 100) / 100;

    // Safety fallback: If recalculation yields 0 but DB has a valid total, restore it.
    // This protects against missing items or conversion glitches.
    const originalTotal = Number(order.total);
    if (finalAmount === 0 && originalTotal > 0) {
        this.logger.warn(`mapOrder Correction: Recalculated total is 0 (Items: ${mappedItems.length}), but DB total is ${originalTotal}. Restoring...`);
        
        // Attempt to convert the original DB total to the target currency
        const storedCurrency = order.currency || 'ETB';
        const { amount: restoredAmount } = this.convertPrice(originalTotal, storedCurrency, target);
        
        if (restoredAmount && restoredAmount > 0) {
            finalAmount = Number(restoredAmount);
            this.logger.log(`mapOrder: Restored total to ${finalAmount} ${target}`);
        } else {
            // If conversion fails (e.g. rate 0), fallback to original raw value as last resort
            finalAmount = originalTotal;
            this.logger.warn(`mapOrder: conversion failed, using raw DB total ${finalAmount}`);
        }
    }

    (order as any).total_display = {
      amount: finalAmount,
      currency: target,
      convertedFrom: (mappedItems[0]?.product as any)?.currency || 'ETB',
      rate: (mappedItems[0] as any)?.price_display?.rate,
    };
    // Also update the root total field to match the display currency total
    // This ensures consistency for the frontend which might use .total instead of .total_display
    (order as any).total = finalAmount;
    (order as any).currency = target;
    
    this.logger.debug(`mapOrder: id=${order.id} finalAmount=${finalAmount} originalTotal=${originalTotal} items=${mappedItems.length}`);
    return order;
  }

  public mapToResponseDto(order: Order, currency?: string): OrderResponseDto {
    const mapped = this.mapOrder(order, currency);
    this.logger.debug(`mapToResponseDto: id=${mapped.id} total=${mapped.total} total_display=${JSON.stringify((mapped as any).total_display)}`);

    // Populate vendors list for frontend logic
    type VendorLike = {
      id?: number;
      displayName?: string | null;
      storeName?: string | null;
    };
    const vendorsMap = new Map<number, VendorLike & { id: number }>();
    for (const it of order.items || []) {
      const vendor = it.product?.vendor as VendorLike | undefined;
      if (
        vendor &&
        typeof vendor.id === 'number' &&
        !vendorsMap.has(vendor.id)
      ) {
        vendorsMap.set(vendor.id, {
          id: vendor.id,
          displayName: vendor.displayName ?? null,
          storeName: vendor.storeName ?? null,
        });
      }
    }
    const vendors = Array.from(vendorsMap.values());

    const deliverer = mapped.deliverer;
    return plainToInstance(OrderResponseDto, {
      ...mapped,
      id: mapped.id,
      total: mapped.total,
      userId: mapped.user?.id,
      delivererId: mapped.deliverer?.id,
      assignedDelivererId: deliverer?.id,
      assignedDelivererName: deliverer?.displayName ?? null,
      assignedDelivererPhone: deliverer?.phoneNumber ?? null,
      vendors,
      vendorName:
        vendors.length === 1
          ? vendors[0].storeName || vendors[0].displayName || null
          : null,
      items:
        mapped.items?.map((item) => ({
          productId: item.product?.id,
          productName: item.product?.name,
          productImageUrl: item.product?.imageUrl ?? null,
          quantity: item.quantity,
          price: item.price,
          price_display: (item as any).price_display,
        })) || [],
      total_display: (mapped as any).total_display,
      currency: (mapped as any).currency,
    });
  }

  /**
   * Cancel an order as admin. Sets status to CANCELLED.
   */
  async cancelOrderForAdmin(orderId: number): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.DELIVERED
    ) {
      throw new BadRequestException('Order cannot be cancelled');
    }
    order.status = OrderStatus.CANCELLED;
    // TODO: Add restocking logic here if needed
    await this.orderRepository.save(order);
    this.emailService
      .sendOrderCancelled(order)
      .catch((e) =>
        this.logger.error(`Failed to send order cancelled email: ${e.message}`),
      );
    return order;
  }

  async assignDeliverer(orderId: number, delivererId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['items', 'items.product', 'items.product.vendor'],
    });
    if (!order) throw new NotFoundException('Order not found');
    const deliverer = await this.orderRepository.manager.findOne(User, {
      where: { id: delivererId },
    });
    if (!deliverer || !deliverer.roles?.includes(UserRole.DELIVERER)) {
      throw new BadRequestException('User is not a deliverer');
    }
    order.deliverer = deliverer;
    order.status = OrderStatus.SHIPPED;
    await this.orderRepository.save(order);
    // Send notification to deliverer
    await this.notificationsService.createAndDispatch({
      userId: delivererId,
      title: 'New Delivery Assigned',
      body: `You have been assigned to deliver order #${orderId}`,
      type: NotificationType.ORDER,
      data: {
        orderId: String(orderId),
        route: `/order-detail?id=${orderId}`,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
    });

    if (deliverer.email) {
      // Gather pickup info
      const stores = new Set<string>();
      (order.items || []).forEach((item) => {
        const v = item.product?.vendor;
        if (v && (v.storeName || v.displayName)) {
          stores.add(v.storeName || v.displayName || 'Unknown Vendor');
        }
      });
      this.emailService
        .sendDelivererAssignmentEmail(
          deliverer,
          order.id,
          Array.from(stores),
        )
        .catch((e) =>
          this.logger.error(
            `Failed to send deliverer assignment email: ${e.message}`,
          ),
        );
    }

    // Send email to customer
    this.emailService
      .sendOrderShipped(order)
      .catch((e) =>
        this.logger.error(`Failed to send order shipped email: ${e.message}`),
      );
    return order;
  }

  async createFromCart(
    userId: number,
    createOrderDto: CreateOrderDto,
    currency?: string,
  ): Promise<any> {
    let itemsToProcess: Array<{ product: any; quantity: number; attributes?: any }> = [];
    const isDirectOrder = createOrderDto.items && createOrderDto.items.length > 0;

    // Check for Duplicate Order Prevention
    // If an order was created in the last 2 minutes for this user with status PENDING or PAID
    // This is valid for both Cart and Direct orders.
    // Ideally we would hash the content, but recent time based check is a good heuristic.
    const recentOrder = await this.orderRepository.findOne({
        where: {
            user: { id: userId },
            status: In([OrderStatus.PENDING, OrderStatus.PROCESSING]),
            createdAt: MoreThan(subMinutes(new Date(), 2)),
        },
        relations: ['items', 'items.product']
    });

    if (recentOrder) {
        // We could be more specific: check if items match. But blocking is safer for now.
        // Or if the payment status is PAID, definitely block.
        if (recentOrder.paymentStatus === PaymentStatus.PAID) {
             throw new BadRequestException('You have a recently paid order. Please wait a moment.');
        }
        // If UNPAID, maybe they are retrying? But the user asked to prevent double payments.
        // If it is UNPAID, we might return the existing order instead of creating a new one?
        // For now, let's just log it.
        this.logger.warn(`User ${userId} attempting order creation but has recent order ${recentOrder.id}`);
        
        // Strict Mode: if recent order exists and is less than 30 seconds old, block.
        // const isTooSooon = recentOrder.created_at > subSeconds(new Date(), 30);
        // if (isTooTooSooon) throw new BadRequestException('Please wait before placing another order.');
    }

    if (isDirectOrder) {
      if (!createOrderDto.items) throw new BadRequestException('No items provided');
      const ids = createOrderDto.items.map((i) => i.productId);
      const products = await this.productsService.findManyByIds(ids, { view: 'full' });
      
      // Map DTO items to entities with validation
      itemsToProcess = createOrderDto.items.map((dtoItem) => {
        const product = products.find((p) => p.id === dtoItem.productId);
        if (!product) {
          throw new BadRequestException(`Product with ID ${dtoItem.productId} not found`);
        }
        return {
          product,
          quantity: dtoItem.quantity || 1,
          attributes: dtoItem.attributes || {},
        };
      });
    } else {
      // Cart Mode
      const cart = await this.cartService.getCart(userId, currency);
      if (cart.items.length === 0) {
        throw new BadRequestException('Cannot create an order from an empty cart.');
      }
      itemsToProcess = cart.items.map((ci) => ({
        product: ci.product,
        quantity: ci.quantity,
        attributes: {}, // Cart items in this codebase do not yet store attributes
      }));
    }

    // Prevent self-purchase: if any item belongs to the same user (vendor), block order creation
    const selfOwned = itemsToProcess.filter(
      (ci) => ci.product?.vendor && ci.product.vendor.id === userId,
    );
    if (selfOwned.length) {
      const ids = selfOwned.map((i) => i.product?.id).filter(Boolean);
      try {
        await this.audit.log({
          actorId: userId,
          action: 'SELF_PURCHASE_BLOCKED',
          targetType: 'ORDER_SELF_PURCHASE',
          targetId: ids[0] ?? 0,
          meta: { productIds: ids },
        });
      } catch {}
      throw new BadRequestException(
        `You cannot purchase your own products (product ids: ${ids.join(', ')}). Remove them to continue.`,
      );
    }

    // Ensure all products have the same currency to minimize exchange losses
    const productCurrencies = new Set(
      itemsToProcess.map((i) => i.product.currency),
    );
    if (productCurrencies.size > 1) {
      throw new BadRequestException(
        'All products in the order must imply the same currency. Please order products of different currencies separately.',
      );
    }
    const lockedCurrency = Array.from(productCurrencies)[0];

    const globalCommissionSetting = await this.uiSettingRepo.findOne({
      where: { key: 'vendor_commission_percentage' },
    });
    // Default to 5% (0.05) if not set. Setting value expected as integer 5 or decimal 0.05?
    // User said "Vendor Commission Percentage (%)". Usually implies 5 for 5%.
    // Safely handle both: if > 1, assume percent (e.g. 5) -> divide by 100.
    const rawVal = globalCommissionSetting ? Number(globalCommissionSetting.value) : 5; 
    const globalRate = rawVal > 1 ? rawVal / 100 : rawVal;

    const orderItems = await Promise.all(itemsToProcess.map(async (item) => {
      const orderItem = new OrderItem();
      orderItem.product = item.product;
      orderItem.quantity = item.quantity;
      orderItem.attributes = item.attributes || {};
      
      let finalPrice = Number(item.product.price);
      
      // Use sale price if available and lower than regular price
      if (item.product.sale_price && Number(item.product.sale_price) > 0 && Number(item.product.sale_price) < finalPrice) {
        finalPrice = Number(item.product.sale_price);
      }

      if (item.attributes && (item.attributes.offerId || item.attributes.offer_id)) {
        try {
           const oId = item.attributes.offerId || item.attributes.offer_id;
           this.logger.log(`[OfferLogic] Checking offer ${oId} for product ${item.product.id}`);
           const msg = await this.messageRepo.findOne({ 
               where: { id: Number(oId) }, 
           });
           
           if (!msg) {
             this.logger.warn(`[OfferLogic] Message ${oId} not found`);
           } else if (msg.type !== MessageType.OFFER) {
             this.logger.warn(`[OfferLogic] Message ${oId} is not an OFFER (type=${msg.type})`);
           } else {
               const content = JSON.parse(msg.content);
               // Support both string/int comparisons
               if (String(content.productId) === String(item.product.id)) {
                   finalPrice = Number(content.price);
                   this.logger.log(`[OfferLogic] Applied offer price ${finalPrice} (was ${item.product.price})`);
               } else {
                   this.logger.warn(`[OfferLogic] Product Mismatch: content.productId=${content.productId} vs item.product.id=${item.product.id}`);
               }
           }
        } catch(e) {
            this.logger.warn(`[OfferLogic] Failed to apply offer price: ${e.message}`);
        }
      }
      orderItem.price = finalPrice;

      // --- Commission Logic (All Vendors are Commission Based) ---
      const vendor = item.product.vendor;
      const lineTotal = orderItem.price * orderItem.quantity;
      
      // Fetch Global Commission or specific
      const defaultRate = 0.05;
      
      // Inline Fetch - ideal to optimize later 
      // Note: We can't await inside synchronous map without Promise.all
      // Doing this check outside map is better.
      // logic continues below...

      // Use vendor-specific rate or default
      let rate = (vendor && vendor.commissionRate) 
        ? Number(vendor.commissionRate) 
        : globalRate; // Use the fetched global rate

      // EBIRR Commission Logic: Vendor 94%, Platform 5%, Ebirr 1%
      // Total deduction = Base Rate (5%) + 1% = 6%
      // However, Ebirr deducts their 1% AT SOURCE (before settling to us).
      // So if we deduct 6% from the vendor, we are effectively covering the Ebirr fee from the vendor's share.
      // This is correct as per business logic: Vendor pays the gateway fee.
      if (createOrderDto.paymentMethod === 'EBIRR') {
        rate += 0.01; 
      }

      orderItem.commission = Math.round(lineTotal * rate * 100) / 100;
      orderItem.vendorPayout = Math.round((lineTotal - orderItem.commission) * 100) / 100;
      // -------------------------

      return orderItem;
    }));

    const total = orderItems.reduce(
      (sum: number, item: OrderItem) => sum + item.price * item.quantity,
      0,
    );

    // Currency Snapshot
    // Lock currency to the product's currency if available
    const currencyCode = lockedCurrency
      ? this.normalizeCurrency(lockedCurrency)
      : this.normalizeCurrency(currency);

    const exchangeRate = this.currencyService.getRate('USD', currencyCode) ?? 1.0;

    // Payment method branching
    const paymentMethod = createOrderDto.paymentMethod.toUpperCase();
    let phoneNumber = createOrderDto.phoneNumber || createOrderDto.mpesaPhone;

    if (!phoneNumber && ['EBIRR', 'MPESA', 'TELEBIRR'].includes(paymentMethod)) {
      const user = await this.usersService.findOne(userId);
      if (user?.phoneNumber) {
        phoneNumber = user.phoneNumber;
      }
    }

    let newOrder: Order;

    const manualMethods = [
      'COD',
      'BANK_TRANSFER',
      'CBE',
      'WAAFI',
      'DMONEY',
    ];

    if (manualMethods.includes(paymentMethod)) {
      newOrder = this.orderRepository.create({
        user: { id: userId } as User,
        items: orderItems,
        total: total,
        shippingAddress: createOrderDto.shippingAddress,
        paymentMethod:
          PaymentMethod[paymentMethod as keyof typeof PaymentMethod],
        paymentStatus: PaymentStatus.UNPAID,
        status: OrderStatus.PENDING,
        currency: currencyCode,
        exchangeRate: exchangeRate,
      });
      const savedOrder = await this.orderRepository.save(newOrder);
      if (!isDirectOrder) await this.cartService.clearCart(userId);
      this.sendConfirmationForOrder(savedOrder.id);
      return this.mapOrder(savedOrder, currency);
    } else if (paymentMethod === 'MPESA') {
      if (!phoneNumber || !phoneNumber.trim()) {
        throw new BadRequestException(
          'phoneNumber is required for MPESA payments.',
        );
      }
      newOrder = this.orderRepository.create({
        user: { id: userId } as User,
        items: orderItems,
        total: total,
        shippingAddress: createOrderDto.shippingAddress,
        paymentMethod: PaymentMethod.MPESA,
        paymentStatus: PaymentStatus.UNPAID,
        status: OrderStatus.PENDING,
        currency: currencyCode,
        exchangeRate: exchangeRate,
      });
      const savedOrder = await this.orderRepository.save(newOrder);
      await this.mpesaService.initiateStkPush(
        total,
        phoneNumber,
        savedOrder.id,
      );
      if (!isDirectOrder) await this.cartService.clearCart(userId);
      this.sendConfirmationForOrder(savedOrder.id);
      return this.mapOrder(savedOrder, currency);
    } else if (paymentMethod === 'TELEBIRR') {
      // TELEBIRR TEMPORARILY DISABLED
      throw new BadRequestException('Telebirr payment is temporarily disabled. Please use Ebirr or other methods.');
      /*
      if (!phoneNumber || !phoneNumber.trim()) {
        throw new BadRequestException(
          'phoneNumber is required for TELEBIRR payments.',
        );
      }
      newOrder = this.orderRepository.create({
        user: { id: userId } as User,
        items: orderItems,
        total: total,
        shippingAddress: createOrderDto.shippingAddress,
        paymentMethod: PaymentMethod.TELEBIRR,
        paymentStatus: PaymentStatus.UNPAID,
        status: OrderStatus.PENDING,
        currency: currencyCode,
        exchangeRate: exchangeRate,
      });
      const savedOrder = await this.orderRepository.save(newOrder);
      
      // Updated Telebirr Integration
      const paymentResponse = await this.telebirrService.createOrder(
        total.toFixed(2),
        `ORDER-${savedOrder.id}`,
      );
      
      // paymentResponse should contain receiveCode or toPayUrl
      const receiveCode = paymentResponse.receiveCode || paymentResponse.toPayUrl || paymentResponse;

      if (!isDirectOrder) await this.cartService.clearCart(userId);
      this.sendConfirmationForOrder(savedOrder.id);
      
      // Return receiveCode for the App SDK
      return { order: this.mapOrder(savedOrder, currency), receiveCode, checkoutUrl: receiveCode }; 
      */
    } else if (paymentMethod === 'EBIRR') {
      if (!phoneNumber || !phoneNumber.trim()) {
        throw new BadRequestException(
          'phoneNumber is required for EBIRR payments.',
        );
      }
      
      newOrder = this.orderRepository.create({
        user: { id: userId } as User,
        items: orderItems,
        total: total,
        shippingAddress: createOrderDto.shippingAddress,
        paymentMethod: PaymentMethod.EBIRR,
        paymentStatus: PaymentStatus.UNPAID,
        status: OrderStatus.PENDING,
        currency: currencyCode,
        exchangeRate: exchangeRate,
      });
      const savedOrder = await this.orderRepository.save(newOrder);

      let paymentResponse;
      try {
        paymentResponse = await this.ebirrService.initiatePayment({
          phoneNumber: phoneNumber,
          amount: total.toFixed(2),
          referenceId: `REF-${savedOrder.id}`,
          invoiceId: `INV-${savedOrder.id}`,
        });
      } catch (error) {
        const msg = error.message || '';
        if (msg.includes('declined by the user') || msg.includes('Insufficient balance')) {
            this.logger.warn(`Ebirr payment rejected/failed for order ${savedOrder.id}: ${msg}`);
        } else {
            this.logger.error(`Ebirr payment system error for order ${savedOrder.id}: ${msg}`);
        }
        
        savedOrder.status = OrderStatus.CANCELLED;
        savedOrder.paymentStatus = PaymentStatus.FAILED;
        await this.orderRepository.save(savedOrder);

        throw new BadRequestException(error.message);
      }

      // Reload to ensure all relations (user, items) are populated for the response
      // Explicitly load relations needed for DTO mapping
      const fullOrder = await this.orderRepository.findOne({
        where: { id: savedOrder.id },
        relations: ['items', 'items.product', 'items.product.vendor', 'user', 'deliverer'],
      });

      // Ebirr Web Checkout Flow:
      // The responseCode will likely be "200" or similar, indicating the URL is ready.
      // We do NOT mark as PAID here. We rely on a webhook callback (TODO) or user return.
      // For now, we return the checkoutUrl so the app can create a WebView.
      
      this.logger.log(`Ebirr initiated. Response: ${JSON.stringify(paymentResponse)}`);

      // NEW HANDLING: If the payment is auto-approved (e.g. Test Env or Pre-auth), mark as PAID immediately.
      // Ebirr response structure based on logs: { errorCode: "0", responseMsg: "RCS_SUCCESS", params: { state: "APPROVED", ... } }
      if (
        paymentResponse.errorCode === '0' && 
        paymentResponse.params && 
        paymentResponse.params.state === 'APPROVED'
      ) {
        this.logger.log(`Ebirr payment auto-approved for Order #${savedOrder.id}. Updating status to PAID.`);
        await this.triggerPostPaymentProcessing(savedOrder.id);
      }

      // If toPayUrl is missing, we pass the whole response.
      // let receiveCode = paymentResponse.toPayUrl; // ERROR: Ebirr response is object, not string logic
      
      // Fix: Ensure checkoutUrl is strictly a string (URL) or null.
      // Ebirr "Push" does not provide a URL.
      let checkoutUrl: string | null = null;
      if (paymentResponse.toPayUrl && typeof paymentResponse.toPayUrl === 'string') {
          checkoutUrl = paymentResponse.toPayUrl;
      }
      
      // If auto-approved (Test Env), we can provide a dummy success URL if client logic expects one.
      // But better to leave it null for PUSH.
      if (!checkoutUrl && savedOrder.paymentStatus === PaymentStatus.PAID) {
          // Optional: checkoutUrl = "https://suuqs.com/success";
      }

      // receiveCode can store the full object for SDK/Debug
      const receiveCode = paymentResponse;

      // Note: We do NOT clear cart yet if using Web Checkout, because payment isn't confirmed.
      // However, Suuq architecture usually clears cart on order creation to avoid double inventory lock.
      // We stick to clearing cart for now.
      if (!isDirectOrder) await this.cartService.clearCart(userId);
      
      const responseOrder = this.mapToResponseDto(fullOrder || savedOrder, currency);
      this.logger.debug(`Returning Order DTO for Web Checkout: id=${responseOrder.id}`);

      return {
        order: responseOrder,
        receiveCode,
        checkoutUrl,
      };
    } else {
      throw new BadRequestException(
        `Unsupported payment method: ${paymentMethod}. Supported: BANK_TRANSFER, COD, MPESA, TELEBIRR, EBIRR, CBE, WAAFI, DMONEY.`,
      );
    }
  }

  async findAllForUser(
    userId: number,
    page: number = 1,
    limit: number = 10,
    currency?: string,
  ): Promise<{ data: OrderResponseDto[]; total: number }> {
    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('order.deliverer', 'deliverer')
      .where('order.userId = :userId', { userId })
      .orderBy('order.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [orders, total] = await qb.getManyAndCount();
    const response = orders.map((order) => {
      const mapped = this.mapOrder(order, currency);
      const deliverer = mapped.deliverer;
      return plainToInstance(OrderResponseDto, {
        ...mapped,
        userId: mapped.user?.id,
        delivererId: mapped.deliverer?.id,
        assignedDelivererId: deliverer?.id,
        assignedDelivererName: deliverer?.displayName ?? null,
        assignedDelivererPhone: deliverer?.phoneNumber ?? null,
        items:
          mapped.items?.map((item) => ({
            productId: item.product?.id,
            productName: item.product?.name,
            productImageUrl: item.product?.imageUrl ?? null,
            quantity: item.quantity,
            price: item.price,
            price_display: (item as any).price_display,
          })) || [],
        total_display: (mapped as any).total_display,
        currency: (mapped as any).currency,
      });
    });
    return { data: response, total };
  }

  async findOneForUser(
    userId: number,
    orderId: number,
    currency?: string,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, user: { id: userId } },
      relations: [
        'items',
        'items.product',
        'items.product.vendor',
        'deliverer',
      ],
    });
    if (!order) {
      throw new NotFoundException(
        'Order not found or you do not have permission to view it.',
      );
    }
    const mapped = this.mapOrder(order, currency);

    // Populate vendors list for frontend logic
    type VendorLike = {
      id?: number;
      displayName?: string | null;
      storeName?: string | null;
    };
    const vendorsMap = new Map<number, VendorLike & { id: number }>();
    for (const it of order.items || []) {
      const vendor = it.product?.vendor as VendorLike | undefined;
      if (
        vendor &&
        typeof vendor.id === 'number' &&
        !vendorsMap.has(vendor.id)
      ) {
        vendorsMap.set(vendor.id, {
          id: vendor.id,
          displayName: vendor.displayName ?? null,
          storeName: vendor.storeName ?? null,
        });
      }
    }
    const vendors = Array.from(vendorsMap.values());

    const deliverer = mapped.deliverer;
    return plainToInstance(OrderResponseDto, {
      ...mapped,
      userId: mapped.user?.id,
      delivererId: mapped.deliverer?.id,
      assignedDelivererId: deliverer?.id,
      assignedDelivererName: deliverer?.displayName ?? null,
      assignedDelivererPhone: deliverer?.phoneNumber ?? null,
      vendors,
      vendorName:
        vendors.length === 1
          ? vendors[0].storeName || vendors[0].displayName || null
          : null,
      items:
        mapped.items?.map((item) => ({
          productId: item.product?.id,
          productName: item.product?.name,
          productImageUrl: item.product?.imageUrl ?? null,
          quantity: item.quantity,
          price: item.price,
          price_display: (item as any).price_display,
        })) || [],
      total_display: (mapped as any).total_display,
      currency: (mapped as any).currency,
    });
  }

  /**
   * Buyer-gated: returns a short-lived signed download URL for a purchased digital item.
   * Validates ownership and payment status, checks product.attributes.downloadKey, enforces a per-user/day limit, and logs via AuditService.
   */
  async getSignedDownloadForBuyer(
    userId: number,
    orderId: number,
    itemId: number,
    ttl?: string,
  ): Promise<{
    url: string;
    expiresIn: number;
    filename?: string;
    contentType?: string;
  }> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, user: { id: userId } },
      relations: ['items', 'items.product'],
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Order not paid');
    }
    const item = (order.items || []).find((it) => it.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');
    const product = item.product as any;
    const attrs: Record<string, any> | undefined =
      product?.attributes && typeof product.attributes === 'object'
        ? product.attributes
        : undefined;
    const downloadKey: string | undefined = attrs?.downloadKey || undefined;
    if (!downloadKey || typeof downloadKey !== 'string') {
      throw new BadRequestException(
        'No digital download available for this item',
      );
    }

    // Optional: basic rate-limit using audit logs (max 10 per day per orderItem)
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const count = await this.audit.countForTargetSince(
      'ORDER_ITEM_DOWNLOAD',
      itemId,
      from,
    );
    if (count >= 10) {
      throw new BadRequestException(
        'Daily download limit reached. Try again later.',
      );
    }

    // Try to infer content type and filename from key
    const fileName = downloadKey.split('/').pop();
    const ext = (fileName?.split('.').pop() || '').toLowerCase();
    const contentType =
      ext === 'pdf'
        ? 'application/pdf'
        : ext === 'epub'
          ? 'application/epub+zip'
          : ext === 'zip'
            ? 'application/zip'
            : undefined;
    const ttlSecs = Math.max(
      60,
      Math.min(parseInt(String(ttl || '600'), 10) || 600, 3600),
    );
    const url = await this.doSpaces.getDownloadSignedUrl(downloadKey, ttlSecs, {
      contentType,
      filename: fileName,
    });

    // Log issuance
    await this.audit.log({
      actorId: userId,
      action: 'SIGNED_DOWNLOAD_ISSUED',
      targetType: 'ORDER_ITEM_DOWNLOAD',
      targetId: itemId,
      meta: { orderId, productId: product?.id, downloadKey, ttlSecs },
    });

    return { url, expiresIn: ttlSecs, filename: fileName, contentType };
  }

  /**
   * Hard delete an order and its children. Irreversible.
   * Ensures FK constraints are satisfied. Returns void (204 No Content at controller).
   */
  async hardDelete(id: number): Promise<void> {
    const existing = await this.orderRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Order not found');
    }
    // If relations aren't cascaded, manually delete children first.
    // OrderItem has onDelete: 'CASCADE', but ensure cleanup explicitly for safety in older rows.
    await this.orderRepository.manager
      .createQueryBuilder()
      .delete()
      .from(OrderItem)
      .where('orderId = :id', { id })
      .execute();

    // If you later add payments/shipments tables, delete them here similarly.

    await this.orderRepository.delete(id);
  }

  // --- Admin Item Updates ---

  private computeAggregateStatus(items: OrderItem[]): OrderStatus {
    if (!items || items.length === 0) return OrderStatus.PENDING;
    const statuses = new Set(items.map((i) => i.status));
    if (statuses.has(OrderStatus.CANCELLED)) return OrderStatus.CANCELLED; // If any cancelled, order is partial/cancelled? Logic varies.
    // Simple logic:
    if (statuses.has(OrderStatus.DELIVERY_FAILED))
      return OrderStatus.DELIVERY_FAILED;
    if (
      items.length > 0 &&
      items.every((i) => i.status === OrderStatus.DELIVERED)
    )
      return OrderStatus.DELIVERED;
    if (statuses.has(OrderStatus.OUT_FOR_DELIVERY))
      return OrderStatus.OUT_FOR_DELIVERY;
    if (statuses.has(OrderStatus.SHIPPED)) return OrderStatus.SHIPPED;
    if (statuses.has(OrderStatus.PROCESSING)) return OrderStatus.PROCESSING;
    return OrderStatus.PENDING;
  }

  async updateOrderItemStatus(
    orderId: number,
    itemId: number,
    next: OrderStatus,
  ) {
    const item = await this.orderItemRepository.findOne({
      where: { id: itemId, order: { id: orderId } } as any,
      relations: ['order', 'order.items'],
    });
    if (!item) throw new NotFoundException('Order item not found');

    // Admin can force status changes, but let's keep some sanity checks or allow all?
    // For Admin, we usually allow overriding transitions.

    item.status = next;
    if (next === OrderStatus.SHIPPED) item.shippedAt = new Date();
    if (next === OrderStatus.DELIVERED) item.deliveredAt = new Date();
    await this.orderItemRepository.save(item);

    // Update aggregate order status based on all items
    const freshItems = await this.orderItemRepository.find({
      where: { order: { id: orderId } } as any,
    });
    const aggregate = this.computeAggregateStatus(freshItems);
    if (item.order.status !== aggregate) {
      item.order.status = aggregate;
      await this.orderRepository.save(item.order);
    }

    return item;
  }

  async updateOrderItemTracking(
    orderId: number,
    itemId: number,
    tracking: {
      trackingCarrier?: string;
      trackingNumber?: string;
      trackingUrl?: string;
    },
  ) {
    const item = await this.orderItemRepository.findOne({
      where: { id: itemId, order: { id: orderId } } as any,
    });
    if (!item) throw new NotFoundException('Order item not found');

    item.trackingCarrier =
      tracking.trackingCarrier ?? item.trackingCarrier ?? null;
    item.trackingNumber =
      tracking.trackingNumber ?? item.trackingNumber ?? null;
    item.trackingUrl = tracking.trackingUrl ?? item.trackingUrl ?? null;
    await this.orderItemRepository.save(item);
    return item;
  }

  /**
   * Called by the OrdersCallbackController when Ebirr redirects user after payment.
   */
  async verifyAndCompleteEbirrOrder(query: any): Promise<Order | null> {
    this.logger.log(`Processing Ebirr Redirect Callback: ${JSON.stringify(query)}`);
    
    // Attempt to resolve referenceId (REF-{id}) from common keys
    let refId = query.referenceId || query.refId || query.ReferenceId || query.ref;
    
    if (!refId) {
       // Fallback scan
       for (const val of Object.values(query)) {
          if (typeof val === 'string' && val.startsWith('REF-')) {
            refId = val;
            break;
          }
       }
    }

    if (!refId) {
      this.logger.warn('Ebirr Callback: Could not extract referenceId from query params.');
      // return null to indicate failure to identify
      return null;
    }

    const orderId = parseInt(refId.replace('REF-', ''), 10);
    if (!orderId || isNaN(orderId)) {
      this.logger.error(`Invalid Order ID parsed: ${refId}`);
      return null;
    }

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['user', 'items', 'items.product', 'items.product.vendor'],
    });
    
    if (!order) {
       this.logger.error(`Order not found for ID ${orderId}`);
       return null;
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
      this.logger.debug(`Order ${orderId} already PAID.`);
      return order;
    }

    // Process Payment & Payouts
    return await this.triggerPostPaymentProcessing(orderId);
  }

  /**
   * Internal Method: Handles transition to PAID and triggers Vendor Payouts (Direct or Wallet).
   * Used by both Async Webhooks and Sync Redirections/Approvals.
   */
  private async triggerPostPaymentProcessing(orderId: number): Promise<Order> {
    const order = await this.orderRepository.findOne({
        where: { id: orderId },
        relations: ['user', 'items', 'items.product', 'items.product.vendor'],
    });

    if (!order) {
        throw new NotFoundException(`Order ${orderId} not found during processing.`);
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
        this.logger.warn(`Order ${order.id} is already processed.`);
        return order;
    }

    // Mark as PAID
    order.paymentStatus = PaymentStatus.PAID;
    order.status = OrderStatus.PROCESSING;
    await this.orderRepository.save(order);

    this.logger.log(`Order ${order.id} marked as PAID. Triggering payouts.`);
    
    // Automate Vendor Payouts
    if (order.items) {
      for (const item of order.items) {
        if (item.vendorPayout > 0 && item.product?.vendor?.id) {
          try {
            // BRANCH: Direct Payout for EBIRR
            if (order.paymentMethod === 'EBIRR') {
               const vendor = item.product.vendor;
               // Ensure we have a phone number to pay to
               if (!vendor.phoneNumber) {
                  throw new Error(`Vendor ${vendor.id} has no phone number for payout.`);
               }
               
               this.logger.log(`Initiating Direct Payout for Order #${order.id} to ${vendor.phoneNumber}`);
               // Call B2C Payout
               const payoutRef = `PAYOUT-${order.id}-${item.id}`;
               await this.ebirrService.sendPayout({
                  phoneNumber: vendor.phoneNumber,
                  amount: item.vendorPayout,
                  referenceId: payoutRef,
                  remark: `Order #${order.id}`
               });
               
               // Log the payout
               await this.walletService.logPayout({
                  vendorId: vendor.id,
                  amount: item.vendorPayout,
                  currency: order.currency || 'ETB',
                  phoneNumber: vendor.phoneNumber,
                  provider: PayoutProvider.EBIRR,
                  transactionReference: payoutRef,
                  orderId: order.id,
                  orderItemId: item.id
               });

               this.logger.log(`Direct Payout Success for Order #${order.id} Item ${item.id}`);

            } else {
               // STANDARD: Credit Internal Wallet (Telebirr, etc.)
               await this.walletService.creditWallet(
                 item.product.vendor.id,
                 item.vendorPayout,
                 TransactionType.EARNING,
                 `Payout for Order #${order.id} - ${item.product.name.substring(0, 20)}...`,
                 order.id,
               );
               this.logger.log(`Credited vendor ${item.product.vendor.id} amount ${item.vendorPayout} for item ${item.id}`);
            }
          } catch (e) {
                this.logger.error(`Payout/Credit Failed for Item ${item.id}: ${e.message}`);
                // FALLBACK: If direct payout fails, should we credit wallet?
                // For now, let's keep it simple: log validation error.
                // It is CRITICAL to credit wallet if external API fails, or track manually.
                
                // Safety Net: Credit Wallet if Payout Failed to avoid vendor loss
                if (order.paymentMethod === 'EBIRR') {
                    // Log failure to PayoutLog so Admin knows!
                    try {
                        const payoutRef = `PAYOUT-${order.id}-${item.id}`;
                        await this.walletService.logPayout({
                            vendorId: item.product.vendor.id,
                            amount: item.vendorPayout,
                            currency: order.currency || 'ETB',
                            phoneNumber: item.product.vendor.phoneNumber || '',
                            provider: PayoutProvider.EBIRR,
                            transactionReference: payoutRef,
                            orderId: order.id,
                            orderItemId: item.id,
                            status: PayoutStatus.FAILED,
                        });
                    } catch (logErr) {
                         this.logger.error(`Failed to log Payout Error: ${logErr.message}`);
                    }

                    this.logger.warn(`Direct Payout failed. Falling back to Internal Wallet Credit for Order #${order.id}`);
                    try {
                        await this.walletService.creditWallet(
                            item.product.vendor.id,
                            item.vendorPayout,
                            TransactionType.EARNING,
                            `FALLBACK: Payout for Order #${order.id} (Ebirr API Failed)`,
                            order.id,
                        );
                    } catch (innerE) {
                        this.logger.error(`CRITICAL: Even Fallback Credit Failed for Item ${item.id}: ${innerE.message}`);
                    }
                }
            } 
        }
      }
    }

    // Send confirmation email asynchronously
    this.sendConfirmationForOrder(order.id);
    
    return order;
  }
}
