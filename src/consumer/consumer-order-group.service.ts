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

/** What the shopper is told about one shop's share of their checkout. */
export interface ConsumerOrderGroupSellerView {
  branchId: number;
  branchName: string | null;
  orderId: number;
  orderNumber: string;
  status: 'RECEIVED' | 'IN_PREPARATION' | 'COMPLETED' | 'CANCELLED';
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
  ) {}

  private sellerSubtotal(seller: ConsumerOrderGroupSellerDto): number {
    return seller.lines.reduce(
      (sum, line) => sum + line.unitPrice * line.quantity,
      0,
    );
  }

  /**
   * The currency every line in this basket is priced in.
   *
   * A register cart carries exactly one currency, and shelf prices are posted in
   * each shop's own — the contract forbids converting them. So a basket mixing a
   * shop pricing in ETB with one pricing in USD has no honest total, and the only
   * safe answer is to refuse it at checkout rather than pick one and be wrong
   * about what the shopper owes.
   */
  private resolveCurrency(dto: PlaceConsumerOrderGroupDto): string {
    const currencies = new Set<string>();
    for (const seller of dto.sellers) {
      for (const line of seller.lines) {
        currencies.add(
          String(line.currency || '')
            .trim()
            .toUpperCase(),
        );
      }
    }
    currencies.delete('');

    if (currencies.size > 1) {
      throw new BadRequestException(
        `This basket mixes ${Array.from(currencies).sort().join(' and ')}. Order from these shops separately.`,
      );
    }
    return (
      Array.from(currencies)[0] ?? (dto.currency ?? 'ETB').trim().toUpperCase()
    );
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

    const currency = this.resolveCurrency(dto);
    const fulfillmentMode = this.resolveFulfillmentMode(dto);

    // Vet every seller first — see the docstring.
    for (const seller of dto.sellers) {
      await this.consumerOrderService.validatePlacement(
        this.toSingleOrderDto(seller, dto, currency),
      );
    }

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
        total: dto.sellers.reduce((sum, s) => sum + this.sellerSubtotal(s), 0),
      }),
    );

    const rejected: ConsumerOrderGroupRejection[] = [];
    for (const seller of dto.sellers) {
      try {
        const placed = await this.consumerOrderService.placeOrder(
          this.toSingleOrderDto(seller, dto, currency),
        );
        await this.groupItemRepo.save(
          this.groupItemRepo.create({
            groupId: group.id,
            branchId: seller.branchId,
            suspendedCartId: String(placed.orderId),
            orderRef: placed.orderNumber,
            subtotal: this.sellerSubtotal(seller),
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
      try {
        const read = await this.consumerOrderService.getOrderStatus(
          orderId,
          item.orderRef,
        );
        status = read.status;
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
   */
  private toSingleOrderDto(
    seller: ConsumerOrderGroupSellerDto,
    dto: PlaceConsumerOrderGroupDto,
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
      lines: seller.lines,
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
