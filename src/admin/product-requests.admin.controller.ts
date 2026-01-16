import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProductRequest } from '../product-requests/entities/product-request.entity';
import { ProductRequestForward } from '../product-requests/entities/product-request-forward.entity';
import { AdminForwardProductRequestDto } from './dto/admin-forward-product-request.dto';
import { SkipThrottle } from '@nestjs/throttler';
import { NotificationsService } from '../notifications/notifications.service';
import { User, SubscriptionTier } from '../users/entities/user.entity';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Controller('admin/product-requests')
export class AdminProductRequestsController {
  constructor(
    @InjectRepository(ProductRequest)
    private readonly requestRepo: Repository<ProductRequest>,
    @InjectRepository(ProductRequestForward)
    private readonly forwardRepo: Repository<ProductRequestForward>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async list(@Query('status') status?: string, @Query('limit') limit?: string) {
    const take = limit ? Math.min(Number(limit) || 50, 100) : 50;

    const qb = this.requestRepo
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.category', 'category')
      .leftJoinAndSelect('request.buyer', 'buyer')
      .orderBy('request.id', 'DESC')
      .take(take);

    if (status) {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length === 1) {
        qb.where('request.status = :status', { status: statuses[0] });
      } else if (statuses.length > 1) {
        qb.where('request.status IN (:...statuses)', { statuses });
      }
    }

    qb.loadRelationCountAndMap('request.forwardedCount', 'request.forwards');

    const rows = await qb.getMany();

    // Enrich with lightweight denormalized fields for the admin UI fallbacks.
    return rows.map((r) => ({
      ...r,
      categoryName: r.category?.name ?? null,
      buyerId: r.buyerId,
      buyerName:
        (r as any)?.buyer?.displayName ||
        (r as any)?.buyer?.storeName ||
        (r as any)?.buyer?.legalName ||
        (r as any)?.buyer?.contactName ||
        (r as any)?.buyer?.email ||
        null,
    }));
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getOne(@Param('id', ParseIntPipe) id: number) {
    const request = await this.requestRepo.findOne({
      where: { id },
      relations: {
        buyer: true,
        category: true,
        acceptedOffer: { product: true, seller: true },
        offers: { seller: true, product: true },
      } as any,
    });

    if (!request) return null;

    let forwards: any[] = [];
    try {
      forwards = await this.forwardRepo.find({
        where: { requestId: id },
        relations: ['vendor', 'forwardedByAdmin'],
        order: { forwardedAt: 'ASC' },
      });
    } catch (err: any) {
      // If the forwards table does not exist yet in this DB, avoid 500s
      if (
        !(
          err &&
          typeof err.message === 'string' &&
          err.message.includes('product_request_forward')
        )
      ) {
        throw err;
      }
    }

    return {
      ...request,
      forwards: forwards.map((f) => this.mapForwardWithUsers(f)),
      categoryName: request.category?.name ?? null,
      buyerId: request.buyerId,
      buyerName:
        (request as any)?.buyer?.displayName ||
        (request as any)?.buyer?.storeName ||
        (request as any)?.buyer?.legalName ||
        (request as any)?.buyer?.contactName ||
        (request as any)?.buyer?.email ||
        null,
    };
  }

  @Post(':id/forward')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async forward(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminForwardProductRequestDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminId = req.user?.id;
    if (!adminId) {
      // AuthGuard + RolesGuard should already ensure this, but be defensive.
      throw new Error('Admin identity required');
    }

    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      return null;
    }

    const uniqueVendorIds = Array.from(new Set(dto.vendorIds));
    const existing = await this.forwardRepo.find({
      where: { requestId: id },
    });
    const alreadyForwardedVendorIds = new Set(existing.map((f) => f.vendorId));
    const toCreate = uniqueVendorIds.filter(
      (vid) => !alreadyForwardedVendorIds.has(vid),
    );

    // Validate that all candidates are PRO vendors
    if (toCreate.length > 0) {
      const candidates = await this.userRepo.find({
        where: { id: In(toCreate) },
        select: ['id', 'subscriptionTier'],
      });
      const validMap = new Map<number, boolean>();
      for (const c of candidates) {
        if (c.subscriptionTier === SubscriptionTier.PRO) {
          validMap.set(c.id, true);
        }
      }

      const invalidIds = toCreate.filter((vid) => !validMap.has(vid));
      if (invalidIds.length > 0) {
        throw new BadRequestException(
          `Cannot forward to non-PRO vendors: ${invalidIds.join(
            ', ',
          )}. Only PRO vendors can receive forwarded requests.`,
        );
      }
    }

    if (!toCreate.length) {
      const forwards = await this.forwardRepo.find({
        where: { requestId: id },
        relations: ['vendor', 'forwardedByAdmin'],
        order: { forwardedAt: 'ASC' },
      });
      return {
        ...request,
        forwards: forwards.map((f) => this.mapForwardWithUsers(f)),
      };
    }

    const newForwards = toCreate.map((vendorId) =>
      this.forwardRepo.create({
        request: { id } as ProductRequest,
        requestId: id,
        vendor: { id: vendorId } as any,
        vendorId,
        forwardedByAdmin: { id: adminId } as any,
        forwardedByAdminId: adminId,
        note: dto.note || null,
        channel: dto.channel || null,
      }),
    );

    await this.forwardRepo.save(newForwards);

    const forwards = await this.forwardRepo.find({
      where: { requestId: id },
      relations: ['vendor', 'forwardedByAdmin'],
      order: { forwardedAt: 'ASC' },
    });

    // Notify vendors about the forwarded request (fire-and-forget)
    this.notifyVendorsOnForward(id, request?.title, toCreate).catch(
      () => undefined,
    );

    return {
      ...request,
      forwards: forwards.map((f) => this.mapForwardWithUsers(f)),
    };
  }

  @Delete(':requestId/forwards/:forwardId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async removeForward(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param('forwardId', ParseIntPipe) forwardId: number,
  ) {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
    });
    if (!request) return null;

    await this.forwardRepo.delete({ id: forwardId, requestId });

    const forwards = await this.forwardRepo.find({
      where: { requestId },
      relations: ['vendor', 'forwardedByAdmin'],
      order: { forwardedAt: 'ASC' },
    });

    return {
      ...request,
      forwards: forwards.map((f) => this.mapForwardWithUsers(f)),
    };
  }

  // Normalize forward records so the admin UI sees user objects, not just ids.
  private mapForwardWithUsers(forward: any) {
    const pickUser = (user?: any) =>
      user
        ? {
            id: user.id,
            displayName: user.displayName ?? null,
            storeName: user.storeName ?? null,
            email: user.email ?? null,
          }
        : null;

    return {
      id: forward.id,
      requestId: forward.requestId,
      vendorId: forward.vendorId,
      forwardedByAdminId: forward.forwardedByAdminId,
      vendor: pickUser(forward.vendor),
      forwardedBy: pickUser(forward.forwardedByAdmin),
      note: forward.note ?? null,
      channel: forward.channel ?? null,
      forwardedAt: forward.forwardedAt,
    };
  }

  private async notifyVendorsOnForward(
    requestId: number,
    title: string | undefined,
    vendorIds: number[],
  ) {
    if (!vendorIds?.length) return;
    const body = title
      ? `New request forwarded: ${title}`
      : 'A product request was forwarded to you';
    const titleText = 'New product request';
    for (const vendorId of vendorIds) {
      await this.notifications.sendToUser({
        userId: vendorId,
        title: titleText,
        body,
        data: {
          type: 'PRODUCT_REQUEST_FORWARD',
          requestId: String(requestId),
        },
      });
    }
  }
}
