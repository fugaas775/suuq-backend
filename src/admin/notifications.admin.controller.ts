/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
  Param,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

import { ProductsService } from '../products/products.service';

@Controller('admin/notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminNotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly productsService: ProductsService,
  ) {}

  @Get()
  async getHistory(
    @Query('page') pageRaw: number | string = 1,
    @Query('limit') limitRaw: number | string = 20,
    @Query('type') type?: NotificationType,
    @Query('userId') userIdRaw?: number | string,
  ) {
    const page = Number(pageRaw) || 1;
    const limit = Number(limitRaw) || 20;
    const userId = userIdRaw ? Number(userIdRaw) : undefined;
    return this.notificationsService.findAll({ page, limit, type, userId });
  }

  @Post('send-user')
  async sendToUser(
    @Body()
    dto: {
      userId: number;
      title: string;
      body: string;
      type: NotificationType;
      data?: any;
      image?: string;
    },
  ) {
    return this.notificationsService.createAndDispatch(dto);
  }

  @Post('broadcast')
  async broadcast(
    @Body()
    dto: {
      role: UserRole;
      title: string;
      body: string;
      type?: NotificationType;
      data?: any;
      image?: string;
    },
  ) {
    return this.notificationsService.broadcastToRole(dto);
  }

  @Post('share-product')
  async shareProduct(
    @Body()
    dto: {
      productId: number;
      userId?: number; // Target specific user
      role?: UserRole; // Or broadcast to role
      title?: string;
      body?: string;
    },
  ) {
    const product = await this.productsService.findOne(dto.productId);

    // Construct valid payload
    const finalTitle = dto.title || 'Featured Product';
    const finalBody = dto.body || `Check out ${product.name} on Suuq!`;
    const image = product.imageUrl || undefined;
    const data = {
      productId: String(product.id),
      route: `/product-detail?id=${product.id}`,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };
    const type = NotificationType.PROMOTION;

    // Dispatch
    if (dto.userId) {
      return this.notificationsService.createAndDispatch({
        userId: dto.userId,
        title: finalTitle,
        body: finalBody,
        type,
        data,
        image,
      });
    } else if (dto.role) {
      return this.notificationsService.broadcastToRole({
        role: dto.role,
        title: finalTitle,
        body: finalBody,
        type,
        data,
        image,
      });
    }

    return { error: 'Must provide userId or role' };
  }

  @Post('delete-batch')
  async deleteBatch(@Body() dto: { ids: number[] }) {
    return this.notificationsService.deleteBatch(dto.ids);
  }
}
