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
import { User, BusinessModel } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { plainToInstance } from 'class-transformer';
import { OrderResponseDto } from './dto/order-response.dto';
import { DoSpacesService } from '../media/do-spaces.service';
import { AuditService } from '../audit/audit.service';
import { CurrencyService } from '../common/services/currency.service';
import { EmailService } from '../email/email.service';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { ProductsService } from '../products/products.service';

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
    private readonly productsService: ProductsService,
    private readonly cartService: CartService,
    private readonly mpesaService: MpesaService,
    private readonly telebirrService: TelebirrService,
    private readonly notificationsService: NotificationsService,
    private readonly doSpaces: DoSpacesService,
    private readonly audit: AuditService,
    private readonly currencyService: CurrencyService,
    private readonly emailService: EmailService,
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
    const { amount: priceConverted, rate } = this.convertPrice(
      item.price,
      productCurrency,
      target,
    );
    (item as any).price_display = {
      amount: priceConverted ?? item.price ?? null,
      currency: target,
      convertedFrom: productCurrency,
      rate,
    };
    (item as any).price = priceConverted ?? item.price;
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
      const price = (it as any).price as number;
      return sum + (typeof price === 'number' ? price * (it.quantity || 0) : 0);
    }, 0);
    (order as any).total_display = {
      amount: Math.round(totalConverted * 100) / 100,
      currency: target,
      convertedFrom: (mappedItems[0]?.product as any)?.currency || 'ETB',
      rate: (mappedItems[0] as any)?.price_display?.rate,
    };
    (order as any).currency = target;
    return order;
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
    await this.notificationsService.sendToUser({
      userId: delivererId,
      title: 'New Delivery Assigned',
      body: `You have been assigned to deliver order #${orderId}`,
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

    const globalCommissionSetting = await this.uiSettingRepo.findOne({
      where: { key: 'vendor_commission_percentage' },
    });
    // Default to 5% (0.05) if not set. Setting value expected as integer 5 or decimal 0.05?
    // User said "Vendor Commission Percentage (%)". Usually implies 5 for 5%.
    // Safely handle both: if > 1, assume percent (e.g. 5) -> divide by 100.
    const rawVal = globalCommissionSetting ? Number(globalCommissionSetting.value) : 5; 
    const globalRate = rawVal > 1 ? rawVal / 100 : rawVal;

    const orderItems = itemsToProcess.map((item) => {
      const orderItem = new OrderItem();
      orderItem.product = item.product;
      orderItem.quantity = item.quantity;
      orderItem.attributes = item.attributes || {};
      orderItem.price = Number(item.product.price);

      // --- Commission Logic (All Vendors are Commission Based) ---
      const vendor = item.product.vendor;
      const lineTotal = orderItem.price * orderItem.quantity;
      
      // Fetch Global Commission or specific
      let defaultRate = 0.05;
      
      // Inline Fetch - ideal to optimize later 
      // Note: We can't await inside synchronous map without Promise.all
      // Doing this check outside map is better.
      // logic continues below...

      // Use vendor-specific rate or default
      const rate = (vendor && vendor.commissionRate) 
        ? Number(vendor.commissionRate) 
        : globalRate; // Use the fetched global rate

      orderItem.commission = Math.round(lineTotal * rate * 100) / 100;
      orderItem.vendorPayout = Math.round((lineTotal - orderItem.commission) * 100) / 100;
      // -------------------------

      return orderItem;
    });

    const total = orderItems.reduce(
      (sum: number, item: OrderItem) => sum + item.price * item.quantity,
      0,
    );

    // Currency Snapshot
    const currencyCode = this.normalizeCurrency(currency);
    const exchangeRate = this.currencyService.getRate('USD', currencyCode) ?? 1.0;

    // Payment method branching
    const paymentMethod = createOrderDto.paymentMethod.toUpperCase();
    const { phoneNumber } = createOrderDto;
    let newOrder: Order;

    const manualMethods = [
      'COD',
      'BANK_TRANSFER',
      'EBIRR',
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
}
