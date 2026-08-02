import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { PosRegisterService } from '../pos-sync/pos-register.service';
import {
  PosSuspendedCart,
  PosSuspendedCartStatus,
} from '../pos-sync/entities/pos-suspended-cart.entity';
import {
  FORMAT_ORDER_MODES,
  PlaceConsumerOrderDto,
  ServiceFormatCode,
} from './dto/place-consumer-order.dto';
import {
  ConsumerOrderResponseDto,
  ConsumerOrderStatusDto,
} from './dto/consumer-response.dto';

/**
 * Random suffix appended to a consumer order reference.
 *
 * The reference used to be `C-<cartId>` — derivable from the id, so it could not
 * gate anything. A random suffix makes the reference an actual capability: you
 * can only read an order's status if you were handed its number at placement.
 */
function mintOrderRef(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

function composeOrderNumber(cartId: number, ref?: string | null): string {
  return ref ? `C-${cartId}-${ref}` : `C-${cartId}`;
}

/** Accepts either the bare suffix or the whole `C-<id>-<suffix>` reference. */
function normalizeRef(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const tail = trimmed.split('-').pop();
  return tail ? tail.toUpperCase() : null;
}

@Injectable()
export class ConsumerOrderService {
  constructor(
    private readonly posRegisterService: PosRegisterService,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(PosSuspendedCart)
    private readonly suspendedCartsRepository: Repository<PosSuspendedCart>,
  ) {}

  async placeOrder(
    dto: PlaceConsumerOrderDto,
  ): Promise<ConsumerOrderResponseDto> {
    // 1. Validate service format vs order mode combination
    const allowedModes: string[] = FORMAT_ORDER_MODES[dto.serviceFormat] ?? [];
    if (!allowedModes.includes(dto.orderMode)) {
      throw new BadRequestException(
        `Order mode "${dto.orderMode}" is not valid for service format "${dto.serviceFormat}". Allowed: ${allowedModes.join(', ')}`,
      );
    }

    // 2. Validate branch exists and is active
    const branch = await this.branchesRepository.findOne({
      where: { id: dto.branchId, isActive: true },
    });
    if (!branch) {
      throw new NotFoundException(
        `Branch ${dto.branchId} not found or is inactive`,
      );
    }

    // 3. Validate branch service format matches requested format (if set)
    if (branch.serviceFormat && branch.serviceFormat !== dto.serviceFormat) {
      throw new BadRequestException(
        `Branch ${dto.branchId} uses service format "${branch.serviceFormat}", not "${dto.serviceFormat}"`,
      );
    }

    // 4. Resolve currency: use dto-provided value, defaulting to ETB
    const currency = (dto.currency ?? 'ETB').trim().toUpperCase();

    // 5. Compute totals from lines
    const itemCount = dto.lines.reduce((sum, l) => sum + l.quantity, 0);
    const total = dto.lines.reduce(
      (sum, l) => sum + l.unitPrice * l.quantity,
      0,
    );

    // 6. Build human-readable label for POS staff (max 255 chars)
    const label = [
      'CONSUMER',
      dto.consumerName?.trim() || 'Guest',
      dto.orderMode,
    ]
      .join(' — ')
      .slice(0, 255);

    // 7. Create suspended cart (consumer acts as anonymous — no actor session)
    const orderRef = mintOrderRef();
    const cart = await this.posRegisterService.suspendCart(
      {
        branchId: dto.branchId,
        label,
        currency,
        itemCount,
        total,
        note: dto.consumerNote ?? undefined,
        cartSnapshot: {
          lines: dto.lines,
          consumerOrder: true,
          serviceFormat: dto.serviceFormat,
        },
        metadata: {
          consumerSource: 'SUUQS',
          consumerOrderRef: orderRef,
          consumerName: dto.consumerName ?? null,
          consumerPhone: dto.consumerPhone ?? null,
          consumerNote: dto.consumerNote ?? null,
          orderMode: dto.orderMode,
          serviceFormat: dto.serviceFormat,
          appointmentTime: dto.appointmentTime ?? null,
          serviceOwner: dto.serviceOwner ?? null,
          tablePreference: dto.tablePreference ?? null,
          guestCount: dto.guestCount ?? null,
        },
      },
      {}, // anonymous actor — no staff user session
    );

    return {
      orderId: cart.id,
      orderNumber: composeOrderNumber(cart.id, orderRef),
      branchId: cart.branchId,
      serviceFormat: dto.serviceFormat,
      orderMode: dto.orderMode,
      status: 'RECEIVED',
    };
  }

  async getOrderStatus(
    orderId: number,
    ref?: string,
  ): Promise<ConsumerOrderStatusDto> {
    const cart = await this.suspendedCartsRepository.findOne({
      where: { id: orderId },
    });
    if (!cart) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // Only expose orders that originated from the consumer app
    const isConsumerOrder = cart.metadata?.consumerSource === 'SUUQS';
    if (!isConsumerOrder) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // Orders minted with a reference must present it. Orders placed before the
    // reference existed stay readable by id so in-flight polls keep working.
    // A mismatch is a 404, not a 403 — a wrong ref must not confirm the id exists.
    const storedRef = normalizeRef(
      cart.metadata?.consumerOrderRef as string | undefined,
    );
    if (storedRef && normalizeRef(ref) !== storedRef) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const status = this.mapCartStatus(cart.status);

    return {
      orderId: cart.id,
      orderNumber: composeOrderNumber(cart.id, storedRef),
      branchId: cart.branchId,
      serviceFormat: cart.metadata?.serviceFormat ?? '',
      orderMode: cart.metadata?.orderMode ?? '',
      status,
      placedAt: cart.createdAt.toISOString(),
      updatedAt: cart.updatedAt.toISOString(),
    };
  }

  private mapCartStatus(
    cartStatus: PosSuspendedCartStatus,
  ): 'RECEIVED' | 'IN_PREPARATION' | 'CANCELLED' {
    switch (cartStatus) {
      case PosSuspendedCartStatus.SUSPENDED:
        return 'RECEIVED';
      case PosSuspendedCartStatus.RESUMED:
        return 'IN_PREPARATION';
      case PosSuspendedCartStatus.DISCARDED:
        return 'CANCELLED';
      default:
        return 'RECEIVED';
    }
  }
}
