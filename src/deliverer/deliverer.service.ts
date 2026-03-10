import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Order,
  OrderStatus,
  DeliveryAcceptanceStatus,
} from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { WalletService } from '../wallet/wallet.service';
import { TransactionType } from '../wallet/entities/wallet-transaction.entity';
import { SettingsService } from '../settings/settings.service';
import { EmailService } from '../email/email.service';
import { CurrencyService } from '../common/services/currency.service';
import { Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { buildOrderStatusNotification } from '../orders/order-notifications.util';
import { RealtimeGateway } from '../realtime/realtime.gateway';

type DeliveryAttentionFilter = 'all' | 'needs_attention';

type DeliveryLocationQueryOptions = {
  latitude?: number | null;
  longitude?: number | null;
  withinKm?: number | null;
};

type DeliveryListOptions = DeliveryLocationQueryOptions & {
  attention?: string | null;
};

type ReferenceLocation = {
  latitude: number;
  longitude: number;
  source: 'query' | 'profile';
};

type DeliveryDestination = {
  latitude: number;
  longitude: number;
  source: 'shipping_address' | 'customer_profile';
};

type DeliveryAttentionView = {
  level: 'normal' | 'reminder' | 'overdue' | 'expired_window';
  phase: 'acceptance_pickup' | 'out_for_delivery' | 'resolved';
  needsAttention: boolean;
  ageHours: number;
  referenceAt: Date | null;
  thresholdsHours: {
    reminderHours: number;
    overdueHours: number;
    expiredWindowHours: number;
  };
  context: { country: string | null; vendorId: number | null };
  label: string;
  timeline: {
    createdAt: Date | null;
    assignedAt: Date | null;
    outForDeliveryAt: Date | null;
    resolvedAt: Date | null;
  };
};

@Injectable()
export class DelivererService {
  private readonly logger = new Logger(DelivererService.name);
  private static readonly DEFAULT_DELIVERY_SLA_POLICY = {
    default: {
      acceptancePickup: {
        reminderHours: 12,
        overdueHours: 24,
        expiredWindowHours: 48,
      },
      outForDelivery: {
        reminderHours: 8,
        overdueHours: 24,
        expiredWindowHours: 72,
      },
    },
    marketOverrides: {},
    vendorOverrides: {},
  };
  private static readonly DELIVERY_FAILURE_REASON_CODES = new Set([
    'CUSTOMER_UNREACHABLE',
    'CUSTOMER_REJECTED',
    'NO_SAFE_DROP_LOCATION',
    'ADDRESS_NOT_FOUND',
    'SAFETY_CONCERN',
    'VEHICLE_ISSUE',
    'OTHER',
  ]);

  private getDeliveryFailureReasonLabel(
    reasonCode?: string | null,
  ): string | null {
    switch (
      String(reasonCode || '')
        .trim()
        .toUpperCase()
    ) {
      case 'CUSTOMER_UNREACHABLE':
        return 'Customer Unreachable';
      case 'CUSTOMER_REJECTED':
        return 'Customer Rejected Delivery';
      case 'NO_SAFE_DROP_LOCATION':
        return 'No Safe Drop Location';
      case 'ADDRESS_NOT_FOUND':
        return 'Address Not Found';
      case 'SAFETY_CONCERN':
        return 'Safety Concern';
      case 'VEHICLE_ISSUE':
        return 'Vehicle Issue';
      case 'OTHER':
        return 'Other';
      default:
        return null;
    }
  }

  private shouldRunAttentionCronOnThisWorker(): boolean {
    const pmId = process.env.pm_id;
    return pmId === undefined || pmId === '0';
  }

  private normalizeAttentionFilter(
    attention?: string | null,
  ): DeliveryAttentionFilter {
    const normalized = String(attention || '')
      .trim()
      .toLowerCase();

    return [
      'needs_attention',
      'needs-attention',
      'attention',
      'attention_only',
      'true',
      '1',
    ].includes(normalized)
      ? 'needs_attention'
      : 'all';
  }

  private getAttentionReferenceKey(referenceAt?: Date | null): string | null {
    if (!referenceAt) {
      return null;
    }

    return new Date(referenceAt).toISOString();
  }

  private hasThresholdNotificationBeenSent(
    order: Order,
    threshold: 'reminder' | 'overdue',
    attention: DeliveryAttentionView,
  ): boolean {
    const state = order.deliveryAttentionNotificationState?.[threshold];
    return (
      state?.phase === attention.phase &&
      state?.referenceAt ===
        this.getAttentionReferenceKey(attention.referenceAt)
    );
  }

  private async markThresholdNotificationSent(
    order: Order,
    threshold: 'reminder' | 'overdue',
    attention: DeliveryAttentionView,
  ) {
    order.deliveryAttentionNotificationState = {
      ...(order.deliveryAttentionNotificationState || {}),
      [threshold]: {
        phase: attention.phase,
        referenceAt: this.getAttentionReferenceKey(attention.referenceAt),
        sentAt: new Date().toISOString(),
      },
    };

    await this.orderRepository.save(order);
  }

  private buildAttentionNotificationPayload(
    order: Order,
    attention: DeliveryAttentionView,
    threshold: 'reminder' | 'overdue',
  ) {
    const phaseLabel =
      attention.phase === 'out_for_delivery'
        ? 'out for delivery'
        : 'awaiting pickup';
    const severityLabel =
      threshold === 'overdue' ? 'Overdue delivery' : 'Delivery reminder';

    return {
      title: severityLabel,
      body:
        threshold === 'overdue'
          ? `Order #${order.id} is overdue while ${phaseLabel}.`
          : `Order #${order.id} needs attention while ${phaseLabel}.`,
      data: {
        type:
          threshold === 'overdue'
            ? 'DELIVERY_ATTENTION_OVERDUE'
            : 'DELIVERY_ATTENTION_REMINDER',
        id: String(order.id),
        orderId: String(order.id),
        route: '/deliverer-deliveries',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        phase: attention.phase,
        level: attention.level,
        ageHours: String(attention.ageHours),
        threshold,
        title: severityLabel,
      },
    };
  }

  private mergeDeliverySlaBand(
    base: {
      reminderHours: number;
      overdueHours: number;
      expiredWindowHours: number;
    },
    override?: Partial<{
      reminderHours: number;
      overdueHours: number;
      expiredWindowHours: number;
    }> | null,
  ) {
    return {
      reminderHours: Number(override?.reminderHours ?? base.reminderHours),
      overdueHours: Number(override?.overdueHours ?? base.overdueHours),
      expiredWindowHours: Number(
        override?.expiredWindowHours ?? base.expiredWindowHours,
      ),
    };
  }

  private async getResolvedDeliverySlaPolicy(
    order?: {
      shippingAddress?: { country?: string | null } | null;
      items?: Array<{
        product?: { vendor?: { id?: number | null } | null } | null;
      }>;
    } | null,
  ) {
    const raw =
      (await this.settingsService.getSystemSetting('delivery_sla_policy')) ||
      DelivererService.DEFAULT_DELIVERY_SLA_POLICY;

    const countryKey = String(order?.shippingAddress?.country || '')
      .trim()
      .toUpperCase();
    const vendorId =
      order?.items
        ?.map((item) => item?.product?.vendor?.id)
        .find((value) => typeof value === 'number') ?? null;

    const defaultPolicy =
      raw?.default || DelivererService.DEFAULT_DELIVERY_SLA_POLICY.default;
    const marketOverride = countryKey
      ? raw?.marketOverrides?.[countryKey]
      : null;
    const vendorOverride = vendorId
      ? raw?.vendorOverrides?.[String(vendorId)]
      : null;

    return {
      acceptancePickup: this.mergeDeliverySlaBand(
        defaultPolicy.acceptancePickup,
        vendorOverride?.acceptancePickup || marketOverride?.acceptancePickup,
      ),
      outForDelivery: this.mergeDeliverySlaBand(
        defaultPolicy.outForDelivery,
        vendorOverride?.outForDelivery || marketOverride?.outForDelivery,
      ),
      context: {
        country: countryKey || null,
        vendorId,
      },
    };
  }

  private buildDeliveryAttention(
    order: Order,
    resolvedPolicy: {
      acceptancePickup: {
        reminderHours: number;
        overdueHours: number;
        expiredWindowHours: number;
      };
      outForDelivery: {
        reminderHours: number;
        overdueHours: number;
        expiredWindowHours: number;
      };
      context: { country: string | null; vendorId: number | null };
    },
  ): DeliveryAttentionView {
    const createdAt = order.createdAt ? new Date(order.createdAt) : null;
    const deliveryAssignedAt = order.deliveryAssignedAt
      ? new Date(order.deliveryAssignedAt)
      : null;
    const outForDeliveryAt = order.outForDeliveryAt
      ? new Date(order.outForDeliveryAt)
      : null;
    const deliveryResolvedAt = order.deliveryResolvedAt
      ? new Date(order.deliveryResolvedAt)
      : null;

    const isResolved = [
      OrderStatus.DELIVERED,
      OrderStatus.DELIVERY_FAILED,
      OrderStatus.CANCELLED,
      OrderStatus.CANCELLED_BY_BUYER,
      OrderStatus.CANCELLED_BY_SELLER,
    ].includes(order.status);

    const phase = isResolved
      ? 'resolved'
      : order.status === OrderStatus.OUT_FOR_DELIVERY
        ? 'out_for_delivery'
        : 'acceptance_pickup';

    const thresholds =
      phase === 'out_for_delivery'
        ? resolvedPolicy.outForDelivery
        : resolvedPolicy.acceptancePickup;

    const referenceAt =
      phase === 'out_for_delivery'
        ? outForDeliveryAt || deliveryAssignedAt || createdAt
        : deliveryAssignedAt || createdAt;

    const ageMs = referenceAt ? Date.now() - referenceAt.getTime() : 0;
    const ageHours = referenceAt
      ? Math.max(0, Math.floor(ageMs / (1000 * 60 * 60)))
      : 0;

    let level: 'normal' | 'reminder' | 'overdue' | 'expired_window' = 'normal';
    if (!isResolved && referenceAt) {
      if (ageHours >= thresholds.expiredWindowHours) {
        level = 'expired_window';
      } else if (ageHours >= thresholds.overdueHours) {
        level = 'overdue';
      } else if (ageHours >= thresholds.reminderHours) {
        level = 'reminder';
      }
    }

    return {
      level,
      phase,
      needsAttention: level !== 'normal',
      ageHours,
      referenceAt,
      thresholdsHours: thresholds,
      context: resolvedPolicy.context,
      label:
        level === 'expired_window'
          ? 'Expired Window'
          : level === 'overdue'
            ? 'Overdue'
            : level === 'reminder'
              ? 'Reminder'
              : 'On Track',
      timeline: {
        createdAt,
        assignedAt: deliveryAssignedAt,
        outForDeliveryAt,
        resolvedAt: deliveryResolvedAt,
      },
    };
  }

  private async enrichDeliveryOrder(order: Order) {
    const resolvedPolicy = await this.getResolvedDeliverySlaPolicy(
      order as any,
    );
    return {
      deliverySla: resolvedPolicy,
      deliveryAttention: this.buildDeliveryAttention(order, resolvedPolicy),
      deliveryAssignedAt: order.deliveryAssignedAt ?? null,
      outForDeliveryAt: order.outForDeliveryAt ?? null,
      deliveryResolvedAt: order.deliveryResolvedAt ?? null,
    };
  }

  private async mapDelivererOrder(
    order: Order,
    referenceLocation?: ReferenceLocation | null,
  ) {
    const vendorsMap = new Map<
      number,
      {
        id: number;
        displayName?: string | null;
        storeName?: string | null;
        phone?: string | null;
        phoneCountryCode?: string | null;
      }
    >();
    for (const it of order.items || []) {
      const vendor: any = (it as any).product?.vendor;
      if (vendor?.id && !vendorsMap.has(vendor.id)) {
        vendorsMap.set(vendor.id, {
          id: vendor.id,
          displayName: vendor.displayName || null,
          storeName: vendor.storeName || null,
          phone: vendor.vendorPhoneNumber || vendor.phoneNumber || null,
          phoneCountryCode: vendor.phoneCountryCode || null,
        });
      }
    }

    const vendors = Array.from(vendorsMap.values());
    return {
      ...order,
      ...(await this.enrichDeliveryOrder(order)),
      ...this.buildDistanceContext(order, referenceLocation || null),
      vendors,
      deliveryFailureReasonLabel: this.getDeliveryFailureReasonLabel(
        order.deliveryFailureReasonCode,
      ),
      vendorName:
        vendors.length === 1
          ? vendors[0].storeName || vendors[0].displayName || null
          : null,
    } as any;
  }

  private filterDelivererOrdersByAttention<
    T extends { deliveryAttention?: { needsAttention?: boolean } },
  >(orders: T[], attention?: string | null) {
    if (this.normalizeAttentionFilter(attention) !== 'needs_attention') {
      return orders;
    }

    return orders.filter((order) => order.deliveryAttention?.needsAttention);
  }

  private isFiniteCoordinate(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private roundDistanceKm(value: number) {
    return Math.round(value * 10) / 10;
  }

  private calculateDistanceKm(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ) {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRadians(to.latitude - from.latitude);
    const dLng = toRadians(to.longitude - from.longitude);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(from.latitude)) *
        Math.cos(toRadians(to.latitude)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
  }

  private getDeliveryDestination(order: Order): DeliveryDestination | null {
    const shippingLatitude = Number(order.shippingAddress?.latitude);
    const shippingLongitude = Number(order.shippingAddress?.longitude);
    if (
      this.isFiniteCoordinate(shippingLatitude) &&
      this.isFiniteCoordinate(shippingLongitude)
    ) {
      return {
        latitude: shippingLatitude,
        longitude: shippingLongitude,
        source: 'shipping_address',
      };
    }

    const customerLatitude = Number((order.user as any)?.locationLat);
    const customerLongitude = Number((order.user as any)?.locationLng);
    if (
      this.isFiniteCoordinate(customerLatitude) &&
      this.isFiniteCoordinate(customerLongitude)
    ) {
      return {
        latitude: customerLatitude,
        longitude: customerLongitude,
        source: 'customer_profile',
      };
    }

    return null;
  }

  private async resolveReferenceLocation(
    delivererId: number | null | undefined,
    options?: DeliveryLocationQueryOptions,
  ): Promise<ReferenceLocation | null> {
    const queryLatitude = Number(options?.latitude);
    const queryLongitude = Number(options?.longitude);
    if (
      this.isFiniteCoordinate(queryLatitude) &&
      this.isFiniteCoordinate(queryLongitude)
    ) {
      return {
        latitude: queryLatitude,
        longitude: queryLongitude,
        source: 'query',
      };
    }

    if (!delivererId) {
      return null;
    }

    const deliverer = await this.userRepository.findOne({
      where: { id: delivererId },
      select: ['id', 'locationLat', 'locationLng'],
    });
    if (
      this.isFiniteCoordinate(Number(deliverer?.locationLat)) &&
      this.isFiniteCoordinate(Number(deliverer?.locationLng))
    ) {
      return {
        latitude: Number(deliverer?.locationLat),
        longitude: Number(deliverer?.locationLng),
        source: 'profile',
      };
    }

    return null;
  }

  private buildDistanceContext(
    order: Order,
    referenceLocation: ReferenceLocation | null,
  ) {
    const destination = this.getDeliveryDestination(order);
    const baseDistance = {
      km: null as number | null,
      meters: null as number | null,
      source: destination?.source || null,
      origin: referenceLocation?.source || null,
      hasUsableCoordinates: !!destination,
    };

    if (!referenceLocation || !destination) {
      return {
        deliveryDistance: baseDistance,
        deliveryDistanceKm: baseDistance.km,
        deliveryDistanceMeters: baseDistance.meters,
        deliveryDistanceSource: baseDistance.source,
        deliveryDistanceOrigin: baseDistance.origin,
        deliveryHasUsableCoordinates: baseDistance.hasUsableCoordinates,
      };
    }

    const distanceKm = this.calculateDistanceKm(referenceLocation, destination);
    const resolvedDistance = {
      km: this.roundDistanceKm(distanceKm),
      meters: Math.round(distanceKm * 1000),
      source: destination.source,
      origin: referenceLocation.source,
      hasUsableCoordinates: true,
    };

    return {
      deliveryDistance: resolvedDistance,
      deliveryDistanceKm: resolvedDistance.km,
      deliveryDistanceMeters: resolvedDistance.meters,
      deliveryDistanceSource: resolvedDistance.source,
      deliveryDistanceOrigin: resolvedDistance.origin,
      deliveryHasUsableCoordinates: resolvedDistance.hasUsableCoordinates,
    };
  }

  private filterOrdersByRadius<
    T extends { deliveryDistanceKm?: number | null },
  >(orders: T[], withinKm?: number | null) {
    if (!withinKm || withinKm <= 0) {
      return orders;
    }

    return orders.filter(
      (order) =>
        typeof order.deliveryDistanceKm === 'number' &&
        order.deliveryDistanceKm <= withinKm,
    );
  }

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly walletService: WalletService,
    private readonly settingsService: SettingsService,
    private readonly emailService: EmailService,
    private readonly currencyService: CurrencyService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async processDeliveryAttentionNotifications(): Promise<void> {
    if (!this.shouldRunAttentionCronOnThisWorker()) {
      return;
    }

    try {
      const activeOrders = await this.orderRepository
        .createQueryBuilder('o')
        .addSelect('o.deliveryAttentionNotificationState')
        .leftJoinAndSelect('o.deliverer', 'deliverer')
        .leftJoinAndSelect('o.items', 'items')
        .leftJoinAndSelect('items.product', 'product')
        .leftJoinAndSelect('product.vendor', 'vendor')
        .where('o.delivererId IS NOT NULL')
        .andWhere('o.status IN (:...statuses)', {
          statuses: [
            OrderStatus.PROCESSING,
            OrderStatus.SHIPPED,
            OrderStatus.OUT_FOR_DELIVERY,
          ],
        })
        .orderBy('o.createdAt', 'DESC')
        .getMany();

      let sentCount = 0;
      for (const order of activeOrders) {
        if (!order.deliverer?.id) {
          continue;
        }

        const resolvedPolicy = await this.getResolvedDeliverySlaPolicy(
          order as any,
        );
        const attention = this.buildDeliveryAttention(order, resolvedPolicy);
        const threshold =
          attention.level === 'reminder'
            ? 'reminder'
            : attention.level === 'overdue' ||
                attention.level === 'expired_window'
              ? 'overdue'
              : null;

        if (!threshold) {
          continue;
        }

        if (
          this.hasThresholdNotificationBeenSent(order, threshold, attention)
        ) {
          continue;
        }

        const payload = this.buildAttentionNotificationPayload(
          order,
          attention,
          threshold,
        );

        await this.notificationsService.createAndDispatch({
          userId: order.deliverer.id,
          title: payload.title,
          body: payload.body,
          type: NotificationType.ORDER,
          data: payload.data,
        });

        await this.markThresholdNotificationSent(order, threshold, attention);
        sentCount += 1;
      }

      if (sentCount > 0) {
        this.logger.log(
          `Sent ${sentCount} delivery attention notification(s) during SLA cron scan`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Delivery attention notification scan failed: ${message}`,
      );
    }
  }

  private async notifyOrderStatusChange(
    order: Order,
    status: OrderStatus,
    deliveryCode?: string,
  ) {
    let userId = order?.user?.id;
    if (!userId) {
      const withUser = await this.orderRepository.findOne({
        where: { id: order.id },
        relations: ['user'],
      });
      userId = withUser?.user?.id;
    }

    if (!userId) return;

    const payload = buildOrderStatusNotification(
      order.id,
      status,
      deliveryCode,
    );
    await this.notificationsService.createAndDispatch({
      userId,
      title: payload.title,
      body: payload.body,
      type: NotificationType.ORDER,
      data: payload.data,
    });
  }

  private async notifyVendorsStatusChange(order: Order, status: OrderStatus) {
    if (!order.items || order.items.length === 0) return;

    // Identify unique vendors involved in the order
    const vendorIds = new Set<number>();
    order.items.forEach((item) => {
      const v = (item.product as any)?.vendor;
      if (v?.id) vendorIds.add(v.id);
    });

    const statusTitle =
      status === OrderStatus.OUT_FOR_DELIVERY
        ? 'Order Picked Up'
        : 'Order Update';
    const statusBody =
      status === OrderStatus.OUT_FOR_DELIVERY
        ? `Order #${order.id} has been picked up by the deliverer.`
        : `Order #${order.id} status updated to ${status}.`;

    for (const vendorId of vendorIds) {
      await this.notificationsService.createAndDispatch({
        userId: vendorId,
        title: statusTitle,
        body: statusBody,
        type: NotificationType.ORDER,
        data: {
          type: 'vendor_order',
          id: String(order.id),
          route: `/vendor-order-detail?id=${order.id}`,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      });
    }
  }

  async getAvailableOrders(options?: DeliveryLocationQueryOptions) {
    const orders = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .where('o.delivererId IS NULL')
      .andWhere("o.status IN ('PENDING', 'PROCESSING', 'SHIPPED')")
      .orderBy('o.createdAt', 'DESC')
      .getMany();

    const referenceLocation = await this.resolveReferenceLocation(
      null,
      options,
    );

    const mappedOrders = await Promise.all(
      orders.map((order) => this.mapDelivererOrder(order, referenceLocation)),
    );

    return this.filterOrdersByRadius(mappedOrders, options?.withinKm ?? null);
  }

  async getMyAssignments(delivererId: number, options?: DeliveryListOptions) {
    const orders = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .where('o.delivererId = :delivererId', { delivererId })
      .orderBy('o.createdAt', 'DESC')
      .getMany();

    const referenceLocation = await this.resolveReferenceLocation(
      delivererId,
      options,
    );

    const mappedOrders = await Promise.all(
      orders.map((order) => this.mapDelivererOrder(order, referenceLocation)),
    );

    return this.filterOrdersByRadius(
      this.filterDelivererOrdersByAttention(mappedOrders, options?.attention),
      options?.withinKm ?? null,
    );
  }

  async acceptAssignment(delivererId: number, orderId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['deliverer'],
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.deliverer && order.deliverer.id !== delivererId) {
      throw new ForbiddenException('Order is already assigned to someone else');
    }

    order.deliverer = { id: delivererId } as any;
    order.deliveryAssignedAt = order.deliveryAssignedAt || new Date();
    order.deliveryResolvedAt = null;
    order.deliveryAttentionNotificationState = null;
    // removed invalid delivererId assignment
    order.deliveryAcceptanceStatus = DeliveryAcceptanceStatus.ACCEPTED;
    if (order.status === OrderStatus.PENDING) {
      order.status = OrderStatus.PROCESSING;
    }

    await this.orderRepository.save(order);
    return { success: true };
  }

  // legacy override to hide it down below
  async dummyAccept(delivererId: number, orderId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['deliverer'],
    });

    if (!order) throw new NotFoundException('Order not found');
    // Deliverers should be able to reject an unassigned (claimable) order to hide/remove it
    // Or if assigned, they reject it.
    if (order.deliverer && order.deliverer.id !== delivererId) {
      throw new ForbiddenException(
        "You cannot reject someone else's assigned order",
      );
    }

    if (!order.deliverer) {
      // It's not assigned to anyone yet. Returning success could be valid to clear it for them locally in flutter.
      return { success: true, message: 'Unassigned order rejected locally.' };
    }

    if (order.deliveryAcceptanceStatus === DeliveryAcceptanceStatus.ACCEPTED) {
      return order; // Already accepted
    }

    order.deliveryAcceptanceStatus = DeliveryAcceptanceStatus.ACCEPTED;
    // Ensure status is SHIPPED (it should be, but just in case)
    order.status = OrderStatus.SHIPPED;

    await this.orderRepository.save(order);

    // Optionally notify vendor/admin that order is accepted
    // For now, no specific notification needed unless requested.

    return order;
  }

  async rejectAssignment(delivererId: number, orderId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'deliverer',
        'items',
        'items.product',
        'items.product.vendor',
      ],
    });

    if (!order) throw new NotFoundException('Order not found');

    // If it's literally unassigned, allow them to hide it locally by just returning success
    if (!order.deliverer) {
      return { success: true, message: 'Unassigned order rejected locally.' };
    }

    // Otherwise, if assigned to someone else
    if (order.deliverer.id !== delivererId) {
      throw new ForbiddenException(
        "You cannot reject someone else's assigned order",
      );
    }

    const delivererName = order.deliverer.displayName || 'A deliverer';

    // Reset assignment
    order.deliverer = undefined;
    order.deliveryAssignedAt = null;
    order.outForDeliveryAt = null;
    order.deliveryResolvedAt = null;
    order.deliveryAttentionNotificationState = null;
    order.deliveryAcceptanceStatus = DeliveryAcceptanceStatus.REJECTED;
    order.status = OrderStatus.PROCESSING;

    // Use query builder to nullify delivererId to be safe with FKs
    await this.orderRepository
      .createQueryBuilder()
      .update(Order)
      .set({
        deliverer: null,
        // removed invalid delivererId from set
        deliveryAssignedAt: null,
        outForDeliveryAt: null,
        deliveryResolvedAt: null,
        deliveryAttentionNotificationState: null,
        deliveryAcceptanceStatus: DeliveryAcceptanceStatus.REJECTED,
        status: OrderStatus.PROCESSING,
      })
      .where('id = :id', { id: orderId })
      .execute();

    // Emit a NotificationService fan-out push back to the Vendor(s).
    const vendorIds = new Set<number>();
    if (order.items) {
      for (const item of order.items) {
        if (item.product && item.product.vendor) {
          vendorIds.add(item.product.vendor.id);
        }
      }
    }

    for (const vendorId of vendorIds) {
      await this.notificationsService.createAndDispatch({
        type: NotificationType.ORDER,
        userId: vendorId,
        title: 'Deliverer Declined Order',
        body: `${delivererName} declined order #${order.id}. Please reassign a deliverer.`,
        data: {
          orderId: order.id.toString(),
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      });
    }

    return { success: true };
  }

  async dummyReject(delivererId: number, orderId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'deliverer',
        'items',
        'items.product',
        'items.product.vendor',
      ],
    });

    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliverer || order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You are not assigned to this order');
    }

    const delivererName = order.deliverer.displayName || 'A deliverer';

    // Reset assignment
    order.deliverer = undefined; // Nullify logic might vary based on cascading
    // or set delivererId = null if TypeORM handles it.
    // Usually assigning null to relation works if nullable: true.
    order.deliveryAcceptanceStatus = DeliveryAcceptanceStatus.REJECTED;
    order.status = OrderStatus.PROCESSING; // Revert status so it appears back in "Ready to ship" lists

    // Use query builder to nullify delivererId to be safe with FKs
    await this.orderRepository
      .createQueryBuilder()
      .update(Order)
      .set({
        deliverer: null,
        status: OrderStatus.PROCESSING,
        deliveryAcceptanceStatus: DeliveryAcceptanceStatus.REJECTED,
      })
      .where('id = :id', { id: orderId })
      .execute();

    // Emit a NotificationService fan-out push back to the Vendor(s).
    // An order can theoretically have items from multiple vendors.
    const vendorIds = new Set<number>();
    if (order.items) {
      for (const item of order.items) {
        if (item.product && item.product.vendor) {
          vendorIds.add(item.product.vendor.id);
        }
      }
    }

    for (const vendorId of vendorIds) {
      await this.notificationsService.createAndDispatch({
        type: NotificationType.ORDER,
        userId: vendorId,
        title: 'Deliverer Declined Order',
        body: `${delivererName} declined order #${order.id}. Please reassign a deliverer.`,
        data: {
          orderId: order.id.toString(),
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      });
    }

    return { success: true };
  }

  async confirmPickup(delivererId: number, orderId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'deliverer',
        'user',
        'items',
        'items.product',
        'items.product.vendor',
      ],
    });

    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliverer || order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You are not assigned to this order');
    }

    // Ensure it was accepted
    if (order.deliveryAcceptanceStatus !== DeliveryAcceptanceStatus.ACCEPTED) {
      throw new ForbiddenException(
        'You must accept the assignment before picking up.',
      );
    }

    if (order.status === OrderStatus.OUT_FOR_DELIVERY) {
      return order; // Already picked up
    }

    // Generate 4-digit OTP
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    order.status = OrderStatus.OUT_FOR_DELIVERY;
    order.outForDeliveryAt = new Date();
    order.deliveryAttentionNotificationState = null;
    order.deliveryCode = code;
    order.deliveryAttemptCount = 0;

    await this.orderRepository.save(order);

    // Notify Customer (send code)
    await this.notifyOrderStatusChange(
      order,
      OrderStatus.OUT_FOR_DELIVERY,
      code,
    );

    // Notify Vendors
    await this.notifyVendorsStatusChange(order, OrderStatus.OUT_FOR_DELIVERY);

    return order;
  }

  async verifyDelivery(delivererId: number, orderId: number, code: string) {
    const order = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.id = :orderId', { orderId })
      .addSelect('order.deliveryCode')
      .leftJoinAndSelect('order.deliverer', 'deliverer')
      .getOne();

    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliverer || order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You are not assigned to this order');
    }

    if (order.status === OrderStatus.DELIVERED) {
      return order;
    }

    if (order.deliveryAttemptCount >= 5) {
      throw new BadRequestException(
        'Too many failed attempts. Contact support.',
      );
    }

    if (!order.deliveryCode) {
      // If legacy order without code, we might allow bypass or require it.
      // For this task, let's assume secure flow is required.
      throw new BadRequestException(
        'Delivery code not generated for this order.',
      );
    }

    // Direct string comparison
    const isValid = code === order.deliveryCode;
    if (!isValid) {
      order.deliveryAttemptCount = (order.deliveryAttemptCount || 0) + 1;
      await this.orderRepository.save(order);
      throw new BadRequestException('Invalid delivery code');
    }

    // Valid code, proceed to mark as delivered
    return this.updateDeliveryStatus(
      delivererId,
      orderId,
      OrderStatus.DELIVERED,
    );
  }

  async attachProofOfDelivery(
    delivererId: number,
    orderId: number,
    proofOfDeliveryUrl: string,
  ) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['deliverer'],
    });

    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliverer || order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You are not assigned to this order');
    }

    order.proofOfDeliveryUrl = proofOfDeliveryUrl;
    await this.orderRepository.save(order);

    return {
      success: true,
      proofOfDeliveryUrl: order.proofOfDeliveryUrl,
    };
  }

  async failDelivery(
    delivererId: number,
    orderId: number,
    reasonCode: string,
    proofOfDeliveryUrl: string,
    notes?: string,
  ) {
    const normalizedReasonCode = String(reasonCode || '')
      .trim()
      .toUpperCase();
    if (
      !DelivererService.DELIVERY_FAILURE_REASON_CODES.has(normalizedReasonCode)
    ) {
      throw new BadRequestException('Invalid delivery failure reason code');
    }

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'deliverer',
        'user',
        'items',
        'items.product',
        'items.product.vendor',
      ],
    });

    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliverer || order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You are not assigned to this order');
    }
    if (order.status !== OrderStatus.OUT_FOR_DELIVERY) {
      throw new BadRequestException(
        'Order must be out for delivery before it can be marked failed',
      );
    }

    order.proofOfDeliveryUrl = proofOfDeliveryUrl;
    order.deliveryFailureReasonCode = normalizedReasonCode;
    order.deliveryFailureNotes = notes?.trim() || null;
    order.status = OrderStatus.DELIVERY_FAILED;
    order.deliveryResolvedAt = new Date();
    order.deliveryAttentionNotificationState = null;

    await this.orderRepository.save(order);
    await this.notifyOrderStatusChange(order, OrderStatus.DELIVERY_FAILED);
    await this.notifyVendorsStatusChange(order, OrderStatus.DELIVERY_FAILED);

    return {
      success: true,
      status: order.status,
      proofOfDeliveryUrl: order.proofOfDeliveryUrl,
      deliveryFailureReasonCode: order.deliveryFailureReasonCode,
      deliveryFailureReasonLabel: this.getDeliveryFailureReasonLabel(
        order.deliveryFailureReasonCode,
      ),
      deliveryFailureNotes: order.deliveryFailureNotes,
    };
  }

  async adminForceDelivery(orderId: number, adminId: number, reason: string) {
    this.logger.log(
      `Admin ${adminId} forcing delivery for order ${orderId}. Reason: ${reason}`,
    );
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'deliverer',
        'user',
        'items',
        'items.product',
        'items.product.vendor',
      ],
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status === OrderStatus.DELIVERED) {
      return order;
    }

    order.status = OrderStatus.DELIVERED;
    order.deliveryResolvedAt = new Date();
    order.deliveryAttentionNotificationState = null;
    await this.orderRepository.save(order);
    await this.notifyOrderStatusChange(order, OrderStatus.DELIVERED);

    await this.onOrderDelivered(order);

    return order;
  }

  /*
   * Centralized logic triggered when an order is first marked DELIVERED.
   * Handles: Socket cleanup, Emails, Sales Count, Wallet Credits.
   */
  private async onOrderDelivered(order: Order) {
    // 0. Clean up Socket Room
    await this.realtimeGateway.notifyOrderComplete(order.id);

    // 1. Send Email
    if (!order.user) {
      const orderWithUser = await this.orderRepository.findOne({
        where: { id: order.id },
        relations: ['user'],
      });
      if (orderWithUser && orderWithUser.user) {
        order.user = orderWithUser.user;
      }
    }
    this.emailService
      .sendOrderDelivered(order)
      .catch((e) =>
        this.logger.error(`Failed to send order delivered email: ${e.message}`),
      );

    // 2. Increment Sales Count
    if (Array.isArray(order.items)) {
      const productQuantities = new Map<number, number>();
      for (const it of order.items) {
        const pid = (it as any).product?.id;
        if (pid) {
          productQuantities.set(
            pid,
            (productQuantities.get(pid) || 0) + (it.quantity || 0),
          );
        }
      }
      if (productQuantities.size > 0) {
        for (const [productId, qty] of productQuantities.entries()) {
          await this.productRepository
            .createQueryBuilder()
            .update(Product)
            .set({
              salesCount: () =>
                `COALESCE(sales_count, 0) + ${Math.max(0, qty)}`,
            })
            .where('id = :productId', { productId })
            .execute();
        }
      }

      // 3. Credit Wallets (Vendor & Deliverer)
      const deliveryFeeVal = await this.settingsService.getSetting(
        'delivery_base_fee',
        50,
      );
      const commissionPercent =
        Number(
          await this.settingsService.getSystemSetting(
            'VENDOR_COMMISSION_PERCENT',
          ),
        ) || 5;
      const orderCurrency = order.currency || 'ETB';

      // Group items by Vendor
      const vendorEarnings = new Map<number, number>();
      for (const item of order.items || []) {
        const vendorId = (item.product as any)?.vendor?.id;
        if (vendorId) {
          const itemTotal = Number(item.price) * Number(item.quantity);
          vendorEarnings.set(
            vendorId,
            (vendorEarnings.get(vendorId) || 0) + itemTotal,
          );
        }
      }

      // Credit Vendors
      for (const [vendorId, total] of vendorEarnings.entries()) {
        const gross = total;
        const commission = gross * (commissionPercent / 100);
        const net = gross - commission;

        if (net > 0) {
          try {
            const vendorWallet = await this.walletService.getWallet(vendorId);
            const walletCurrency = vendorWallet.currency || 'KES';
            let amountToCredit = net;
            if (orderCurrency !== walletCurrency) {
              amountToCredit = this.currencyService.convert(
                net,
                orderCurrency,
                walletCurrency,
              );
            }
            await this.walletService.creditWallet(
              vendorId,
              amountToCredit,
              TransactionType.EARNING,
              `Earnings from Order #${order.id} (${orderCurrency} ${net.toFixed(
                2,
              )})`,
              order.id,
            );
          } catch (e: any) {
            this.logger.error(
              `Failed to credit vendor ${vendorId}: ${e.message}`,
            );
          }
        }
      }

      // Credit Deliverer
      const delivererId = order.deliverer?.id;
      if (delivererId) {
        const DELIVERY_FEE = Number(deliveryFeeVal);
        if (DELIVERY_FEE > 0) {
          try {
            const delivererWallet =
              await this.walletService.getWallet(delivererId);
            const walletCurrency = delivererWallet.currency || 'KES';
            const baseFeeCurrency = 'ETB';
            let amountToCredit = DELIVERY_FEE;
            if (baseFeeCurrency !== walletCurrency) {
              amountToCredit = this.currencyService.convert(
                DELIVERY_FEE,
                baseFeeCurrency,
                walletCurrency,
              );
            }
            await this.walletService.creditWallet(
              delivererId,
              amountToCredit,
              TransactionType.EARNING,
              `Delivery Fee for Order #${order.id}`,
              order.id,
            );
          } catch (e: any) {
            this.logger.error(
              `Failed to credit deliverer ${delivererId}: ${e.message}`,
            );
          }
        }
      }
    }
  }

  async updateDeliveryStatus(
    delivererId: number,
    orderId: number,
    newStatus: OrderStatus,
  ) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'deliverer',
        'user',
        'items',
        'items.product',
        'items.product.vendor',
      ],
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliverer || order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You are not assigned to this order');
    }
    const wasDelivered = order.status === OrderStatus.DELIVERED;
    order.status = newStatus;
    if (newStatus === OrderStatus.OUT_FOR_DELIVERY && !order.outForDeliveryAt) {
      order.outForDeliveryAt = new Date();
      order.deliveryAttentionNotificationState = null;
    }
    if (
      newStatus === OrderStatus.DELIVERED ||
      newStatus === OrderStatus.DELIVERY_FAILED
    ) {
      order.deliveryResolvedAt = new Date();
      order.deliveryAttentionNotificationState = null;
    }
    await this.orderRepository.save(order);
    await this.notifyOrderStatusChange(order, newStatus);

    if (!wasDelivered && newStatus === OrderStatus.DELIVERED) {
      await this.onOrderDelivered(order);
    }

    // Return enriched detail including vendor summaries
    const fresh = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .where('o.id = :orderId', { orderId })
      .getOne();
    if (!fresh) return order;
    const referenceLocation = await this.resolveReferenceLocation(delivererId);
    const vendorsMap = new Map<
      number,
      {
        id: number;
        displayName?: string | null;
        storeName?: string | null;
        phone?: string | null;
        phoneCountryCode?: string | null;
      }
    >();
    for (const it of fresh.items || []) {
      const v: any = (it as any).product?.vendor;
      if (v?.id && !vendorsMap.has(v.id)) {
        vendorsMap.set(v.id, {
          id: v.id,
          displayName: v.displayName || null,
          storeName: v.storeName || null,
          phone: v.vendorPhoneNumber || v.phoneNumber || null,
          phoneCountryCode: v.phoneCountryCode || null,
        });
      }
    }
    const vendors = Array.from(vendorsMap.values());
    return {
      ...fresh,
      ...(await this.enrichDeliveryOrder(fresh)),
      ...this.buildDistanceContext(fresh, referenceLocation),
      vendors,
      vendorName:
        vendors.length === 1
          ? vendors[0].storeName || vendors[0].displayName || null
          : null,
    } as any;
  }

  async getMyAssignmentDetail(
    delivererId: number,
    orderId: number,
    options?: DeliveryLocationQueryOptions,
  ) {
    const order = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .where('o.id = :orderId', { orderId })
      .andWhere('o.delivererId = :delivererId', { delivererId })
      .getOne();
    if (!order) throw new NotFoundException('Order not found');
    const referenceLocation = await this.resolveReferenceLocation(
      delivererId,
      options,
    );

    const vendorsMap = new Map<
      number,
      {
        id: number;
        displayName?: string | null;
        storeName?: string | null;
        phone?: string | null;
        phoneCountryCode?: string | null;
        locationLat?: number | null;
        locationLng?: number | null;
        address?: string | null;
      }
    >();
    for (const it of order.items || []) {
      const v: any = (it as any).product?.vendor;
      if (v?.id && !vendorsMap.has(v.id)) {
        vendorsMap.set(v.id, {
          id: v.id,
          displayName: v.displayName || null,
          storeName: v.storeName || null,
          phone: v.vendorPhoneNumber || v.phoneNumber || null,
          phoneCountryCode: v.phoneCountryCode || null,
          // Add address details for pickup
          locationLat: v.locationLat || null,
          locationLng: v.locationLng || null,
          address: v.address || 'Vendor Address',
        });
      }
    }
    const vendors = Array.from(vendorsMap.values());
    const customer = order.user;

    return {
      ...order,
      ...(await this.enrichDeliveryOrder(order)),
      ...this.buildDistanceContext(order, referenceLocation),
      vendors,
      vendorName:
        vendors.length === 1
          ? vendors[0].storeName || vendors[0].displayName || null
          : null,
      deliveryFailureReasonLabel: this.getDeliveryFailureReasonLabel(
        order.deliveryFailureReasonCode,
      ),
      customerName: customer?.displayName || 'Customer',
      customerPhone: customer?.phoneNumber || null,
      customerLocationLat: customer?.locationLat || null,
      customerLocationLng: customer?.locationLng || null,
      shippingAddress: order.shippingAddress,
    } as any;
  }
}
