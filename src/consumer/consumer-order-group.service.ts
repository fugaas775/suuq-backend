import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { ConsumerOrderService } from './consumer-order.service';
import {
  ConsumerOrderGroup,
  ConsumerOrderGroupItem,
} from './entities/consumer-order-group.entity';
import {
  ConsumerOrderGroupSellerDto,
  PlaceConsumerOrderGroupDto,
} from './dto/place-consumer-order-group.dto';
import {
  mintConsumerOrderGroupRef,
  normalizeConsumerOrderGroupRef,
} from './consumer-order-ref';
import { ConsumerShelfService } from './consumer-shelf.service';
import { ConsumerOrderLineDto } from './dto/place-consumer-order.dto';
import { modeNeedsTable, modeNeedsTime } from '../common/service-formats';

/**
 * Ceiling on one line's quantity. A shopper does not order 90 000 coffees; a
 * script does, and the till is the thing that pays for it.
 */
const MAX_LINE_QUANTITY = 500;

/** What the shopper is told about one shop's share of their checkout. */
export interface ConsumerOrderGroupSellerView {
  branchId: number;
  branchName: string | null;
  orderId: number;
  orderNumber: string;
  status:
    | 'RECEIVED'
    | 'IN_PREPARATION'
    | 'COMPLETED'
    | 'DECLINED'
    | 'CANCELLED';
  /** Why this shop could not take its share. Present only on DECLINED. */
  declineReason?: string;
  subtotal: number;
}

/** A shop that could not be reached at placement, and why. */
export interface ConsumerOrderGroupRejection {
  branchId: number;
  reason: string;
}

export interface ConsumerOrderGroupView {
  publicRef: string;
  consumerName: string | null;
  consumerPhone: string | null;
  fulfillmentMode: string;
  deliveryAddress: Record<string, unknown> | null;
  currency: string;
  total: number;
  placedAt: string;
  sellers: ConsumerOrderGroupSellerView[];
}

@Injectable()
export class ConsumerOrderGroupService {
  private readonly logger = new Logger(ConsumerOrderGroupService.name);

  constructor(
    private readonly consumerOrderService: ConsumerOrderService,
    @InjectRepository(ConsumerOrderGroup)
    private readonly groupRepo: Repository<ConsumerOrderGroup>,
    @InjectRepository(ConsumerOrderGroupItem)
    private readonly groupItemRepo: Repository<ConsumerOrderGroupItem>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
    private readonly shelf: ConsumerShelfService,
  ) {}

  /**
   * Rebuilds one shop's lines from that shop's shelf.
   *
   * Everything priced or named here comes from the server. The client's
   * `unitPrice`, `name` and `currency` are read and discarded, because they were
   * never checked: a basket posted straight at this endpoint could carry
   * `unitPrice: 1` for a 200 ETB drink and it reached the till reading ETB 1,
   * since `withConsumerCartLines` copies the submitted price onto the register
   * cart line verbatim. Only `productId` and `quantity` survive the trip.
   *
   * A product the shelf does not return is not sellable at this branch — it may
   * not exist, be soft-deleted, be unlisted, belong to another shop, or be a
   * supplier row with no consumer price. Absence is a refusal, never a reason to
   * fall back to what the client claimed.
   *
   * This doubles as the price-drift rule: a repriced item is simply placed at
   * the shop's current price, which is what the till would charge anyway.
   */
  private async priceSellerLines(seller: ConsumerOrderGroupSellerDto): Promise<{
    lines: ConsumerOrderLineDto[];
    subtotal: number;
    currency: string | null;
  }> {
    const requested = new Map<number, number>();
    for (const line of seller.lines) {
      const productId = Number(line.productId);
      if (!Number.isInteger(productId) || productId <= 0) continue;
      const quantity = Math.min(
        MAX_LINE_QUANTITY,
        Math.max(1, Math.floor(Number(line.quantity) || 0)),
      );
      requested.set(productId, (requested.get(productId) ?? 0) + quantity);
    }

    if (!requested.size) {
      throw new BadRequestException('That order had nothing in it.');
    }

    const shelf = await this.shelf.resolveSellableLines(
      seller.branchId,
      Array.from(requested.keys()),
    );

    const missing = Array.from(requested.keys()).filter((id) => !shelf.has(id));
    if (missing.length) {
      throw new BadRequestException(
        missing.length === requested.size
          ? 'Nothing in this order is on sale at that shop any more.'
          : `${missing.length} item(s) are no longer on sale at that shop. Remove them and try again.`,
      );
    }

    const soldOut = Array.from(requested.keys())
      .map((id) => shelf.get(id))
      .filter((item) => item?.stockState === 'OUT_OF_STOCK');
    if (soldOut.length) {
      throw new BadRequestException(
        `${soldOut.map((i) => i.name).join(', ')} just sold out.`,
      );
    }

    const currencies = new Set<string>();
    const lines: ConsumerOrderLineDto[] = [];
    let subtotal = 0;

    for (const [productId, quantity] of requested) {
      const item = shelf.get(productId);
      const currency = String(item.currency || 'ETB')
        .trim()
        .toUpperCase();
      currencies.add(currency);
      subtotal += item.price * quantity;
      lines.push({
        productId: String(productId),
        name: item.name,
        quantity,
        unitPrice: item.price,
        currency,
      });
    }

    if (currencies.size > 1) {
      throw new BadRequestException(
        'That shop prices in more than one currency. Order those items separately.',
      );
    }

    return { lines, subtotal, currency: Array.from(currencies)[0] ?? null };
  }

  /**
   * What this shop needs to know before it can do the work.
   *
   * The sibling QR storefront has always refused an appointment with no time and
   * a dine-in order with no table (`validateOrder` in publicStorefront.js); the
   * marketplace checkout never asked, so a barber could receive an APPOINTMENT
   * booked for no particular moment and a café a DINE_IN order for no table. The
   * mode predicates are shared with that storefront rather than restated.
   *
   * Enforced here rather than in `validatePlacement`, which is shared with the
   * frozen `/consumer/v1/orders` surface the Flutter app calls — tightening what
   * that accepts could break a shipped app.
   */
  private assertModeRequirements(seller: ConsumerOrderGroupSellerDto): void {
    if (modeNeedsTime(seller.orderMode) && !seller.appointmentTime?.trim()) {
      throw new BadRequestException(
        'Choose a date and time for that shop before ordering.',
      );
    }
    if (modeNeedsTable(seller.orderMode) && !seller.tablePreference?.trim()) {
      throw new BadRequestException(
        'Tell that shop which table you are at before ordering.',
      );
    }
  }

  /**
   * What the shopper asked for overall. Derived, never accepted from the client,
   * so it can never contradict the orders it summarises.
   */
  private resolveFulfillmentMode(dto: PlaceConsumerOrderGroupDto): string {
    const modes = new Set(dto.sellers.map((s) => s.orderMode));
    return modes.size === 1 ? Array.from(modes)[0] : 'MIXED';
  }

  /**
   * Places one checkout across one or more shops.
   *
   * Every seller is validated before any order is placed. That ordering is the
   * whole safety story here: once `placeOrder` lands a cart on a branch's
   * register, staff may already be looking at it, and no transaction of ours can
   * take it back. Vetting first turns "half the basket went through" from a
   * routine outcome into an infrastructure-failure-only one.
   *
   * When a placement still fails after validation, the shops that succeeded keep
   * their orders and the response names the ones that did not — because the
   * alternative is telling a shopper their whole order failed while a café is
   * already making half of it.
   */
  async placeGroup(
    dto: PlaceConsumerOrderGroupDto,
    customerUserId?: number | null,
  ): Promise<
    ConsumerOrderGroupView & { rejected: ConsumerOrderGroupRejection[] }
  > {
    const branchIds = dto.sellers.map((s) => s.branchId);
    if (new Set(branchIds).size !== branchIds.length) {
      throw new BadRequestException(
        'One shop appears twice in this basket. Combine those items into a single order.',
      );
    }

    const fulfillmentMode = this.resolveFulfillmentMode(dto);
    const rejected: ConsumerOrderGroupRejection[] = [];
    const priced: Array<{
      seller: ConsumerOrderGroupSellerDto;
      lines: ConsumerOrderLineDto[];
      subtotal: number;
      currency: string | null;
    }> = [];

    // Vet and re-price every seller before anything is written — see the
    // docstring. A seller that fails here is dropped from the basket rather than
    // failing the whole checkout: one delisted item should not cost a shopper
    // the two shops that were fine.
    for (const seller of dto.sellers) {
      try {
        await this.consumerOrderService.validatePlacement(
          this.toSingleOrderDto(seller, dto, seller.lines, 'ETB'),
        );
        this.assertModeRequirements(seller);
        priced.push({ seller, ...(await this.priceSellerLines(seller)) });
      } catch (error: any) {
        this.logger.warn(
          `Order group: branch #${seller.branchId} vetted out — ${error?.message}`,
        );
        rejected.push({
          branchId: seller.branchId,
          reason: error?.message ?? 'That shop could not take this order.',
        });
      }
    }

    if (!priced.length) {
      throw new BadRequestException(
        rejected[0]?.reason ?? 'That order could not be placed.',
      );
    }

    // Currency comes from the shelves now, not from the payload.
    const currencies = new Set(
      priced.map((p) => p.currency).filter((c): c is string => !!c),
    );
    if (currencies.size > 1) {
      throw new BadRequestException(
        `This basket mixes ${Array.from(currencies).sort().join(' and ')}. Order from these shops separately.`,
      );
    }
    const currency = Array.from(currencies)[0] ?? 'ETB';

    const group = await this.groupRepo.save(
      this.groupRepo.create({
        publicRef: await this.mintUniqueRef(),
        consumerName: dto.consumerName || null,
        consumerPhone: dto.consumerPhone || null,
        customerUserId: customerUserId ?? null,
        fulfillmentMode,
        deliveryAddress: dto.deliveryAddress
          ? { ...dto.deliveryAddress }
          : null,
        currency,
        // Totalled from the shelf, never from what arrived.
        total: priced.reduce((sum, p) => sum + p.subtotal, 0),
      }),
    );

    for (const { seller, lines, subtotal } of priced) {
      try {
        const placed = await this.consumerOrderService.placeOrder(
          this.toSingleOrderDto(seller, dto, lines, currency),
        );
        await this.groupItemRepo.save(
          this.groupItemRepo.create({
            groupId: group.id,
            branchId: seller.branchId,
            suspendedCartId: String(placed.orderId),
            orderRef: placed.orderNumber,
            subtotal,
          }),
        );
      } catch (error: any) {
        this.logger.warn(
          `Order group ${group.publicRef}: branch #${seller.branchId} rejected — ${error?.message}`,
        );
        rejected.push({
          branchId: seller.branchId,
          reason: error?.message ?? 'That shop could not take this order.',
        });
      }
    }

    if (rejected.length === dto.sellers.length) {
      // Nothing landed anywhere; the group is an empty shell. Remove it rather
      // than hand back a tracking code that will never show an order.
      await this.groupRepo.delete({ id: group.id });
      throw new BadRequestException(
        rejected[0]?.reason ?? 'That order could not be placed.',
      );
    }

    return { ...(await this.getGroup(group.publicRef)), rejected };
  }

  /**
   * Reads a checkout back by its public code.
   *
   * Status comes from the carts themselves, every time — this table stores none.
   * A shopper refreshing the page sees what the till sees.
   */
  async getGroup(publicRef: string): Promise<ConsumerOrderGroupView> {
    const normalized = normalizeConsumerOrderGroupRef(publicRef);
    if (!normalized) {
      throw new NotFoundException('That order could not be found.');
    }

    const group = await this.groupRepo.findOne({
      where: { publicRef: normalized },
    });
    if (!group) {
      throw new NotFoundException('That order could not be found.');
    }

    const items = await this.groupItemRepo.find({
      where: { groupId: group.id },
      order: { id: 'ASC' },
    });
    const branches = items.length
      ? await this.branchRepo.find({
          where: items.map((item) => ({ id: item.branchId })),
          select: ['id', 'name'],
        })
      : [];
    const nameByBranch = new Map(branches.map((b) => [b.id, b.name]));

    const sellers: ConsumerOrderGroupSellerView[] = [];
    for (const item of items) {
      const orderId = Number(item.suspendedCartId);
      let status: ConsumerOrderGroupSellerView['status'] = 'RECEIVED';
      let declineReason: string | undefined;
      try {
        const read = await this.consumerOrderService.getOrderStatus(
          orderId,
          item.orderRef,
        );
        status = read.status;
        declineReason = read.declineReason;
      } catch {
        // The cart is gone from under us (a hard delete, a purge). Nothing
        // useful left to say about it, and one unreadable seller must not take
        // down the whole tracking page.
        status = 'CANCELLED';
      }
      sellers.push({
        branchId: item.branchId,
        branchName: nameByBranch.get(item.branchId) ?? null,
        orderId,
        orderNumber: item.orderRef,
        status,
        ...(declineReason ? { declineReason } : {}),
        subtotal: Number(item.subtotal),
      });
    }

    return {
      publicRef: group.publicRef,
      consumerName: group.consumerName ?? null,
      consumerPhone: group.consumerPhone ?? null,
      fulfillmentMode: group.fulfillmentMode,
      deliveryAddress: group.deliveryAddress ?? null,
      currency: group.currency,
      total: Number(group.total),
      placedAt: group.createdAt.toISOString(),
      sellers,
    };
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Flattens one seller's share into the single-order shape the existing
   * consumer path already understands, so a multi-shop checkout and a QR-scanned
   * one reach the register through exactly the same code.
   *
   * The delivery address is written into the note as well as its own column: the
   * column is the record, but staff read the note, and a rider needs the address
   * on the ticket in front of them.
   *
   * `lines` is passed in rather than read off the seller, because by the time an
   * order is actually placed the lines are the shelf's, not the client's.
   */
  private toSingleOrderDto(
    seller: ConsumerOrderGroupSellerDto,
    dto: PlaceConsumerOrderGroupDto,
    lines: ConsumerOrderLineDto[],
    currency: string,
  ) {
    const notes: string[] = [];
    if (seller.orderMode === 'DELIVERY' && dto.deliveryAddress) {
      const { line1, city, note } = dto.deliveryAddress;
      notes.push(`Deliver to: ${[line1, city].filter(Boolean).join(', ')}`);
      if (note) notes.push(note);
    }
    if (seller.note) notes.push(seller.note);

    return {
      branchId: seller.branchId,
      serviceFormat: seller.serviceFormat,
      orderMode: seller.orderMode,
      lines,
      currency,
      consumerName: dto.consumerName,
      consumerPhone: dto.consumerPhone,
      consumerNote: notes.length ? notes.join(' — ').slice(0, 1000) : undefined,
      appointmentTime: seller.appointmentTime,
      tablePreference: seller.tablePreference,
      guestCount: seller.guestCount,
    };
  }

  /** Retries on the astronomically unlikely collision rather than 500ing. */
  private async mintUniqueRef(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = mintConsumerOrderGroupRef();
      const clash = await this.groupRepo.findOne({
        where: { publicRef: candidate },
        select: ['id'],
      });
      if (!clash) return candidate;
    }
    throw new BadRequestException('Could not start that order. Try again.');
  }
}
