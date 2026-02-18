import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
  Query,
  UseInterceptors,
  Logger,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
// import { RolesGuard } from '../auth/roles.guard';
// import { Roles } from '../common/decorators/roles.decorator';
// import { UserRole } from '../auth/roles.enum';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import {
  ApiTags,
  ApiOkResponse,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { ClassSerializerInterceptor } from '@nestjs/common';

@ApiTags('User Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiBody({ type: CreateOrderDto })
  @ApiOkResponse({ description: 'Create order from cart' })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() createOrderDto: CreateOrderDto,
    @Query('currency') currency?: string,
  ) {
    this.logger.debug(`Order create: requestedCurrency=${currency}`);
    return this.ordersService.createFromCart(
      req.user.id,
      createOrderDto,
      currency,
    );
  }

  @Get()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Get paginated user order history' })
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('currency') currency?: string,
  ) {
    this.logger.debug(`Order list: requestedCurrency=${currency}`);
    return this.ordersService.findAllForUser(
      req.user.id,
      page,
      limit,
      currency,
    );
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Get single user order' })
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('currency') currency?: string,
  ) {
    this.logger.debug(`Order detail: requestedCurrency=${currency}`);
    return this.ordersService.findOneForUser(req.user.id, id, currency);
  }

  @Post(':id/payment-proof')
  @UseInterceptors(FileInterceptor('file'))
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({
    description: 'Upload payment proof (bank transfer screenshot)',
  })
  async uploadPaymentProof(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    this.logger.debug(`Upload payment proof for order #${id}`);
    return this.ordersService.uploadPaymentProof(req.user.id, id, file);
  }

  // Buyer-gated: return a short-lived attachment URL for a purchased digital product.
  @Get(':orderId/items/:itemId/signed-download')
  @ApiParam({ name: 'orderId', type: Number })
  @ApiParam({ name: 'itemId', type: Number })
  @ApiQuery({ name: 'ttl', required: false, type: Number })
  @ApiOkResponse({
    description: 'Get a signed download URL for a purchased item',
  })
  async signedDownload(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Query('ttl') ttl?: string,
  ) {
    return this.ordersService.getSignedDownloadForBuyer(
      req.user.id,
      orderId,
      itemId,
      ttl,
    );
  }

  @Post(':id/dispute')
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { reason: { type: 'string' }, details: { type: 'string' } },
    },
  })
  @ApiOkResponse({ description: 'Dispute an order' })
  async disputeOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @Body('details') details?: string,
  ) {
    return this.ordersService.disputeOrder(id, reason, details);
  }

  @Post('dispute/:id/resolve')
  @ApiParam({ name: 'id', type: Number, description: 'Dispute ID' })
  @ApiOkResponse({ description: 'Resolve dispute (Vendor wins)' })
  async resolveDispute(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body('resolutionNotes') resolutionNotes?: string,
  ) {
    return this.ordersService.resolveDispute(id, req.user.id, resolutionNotes);
  }

  @Post('dispute/:id/refund')
  @ApiParam({ name: 'id', type: Number, description: 'Dispute ID' })
  @ApiOkResponse({ description: 'Refund dispute (Buyer wins)' })
  async refundDispute(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body('resolutionNotes') resolutionNotes?: string,
  ) {
    return this.ordersService.refundDispute(id, req.user.id, resolutionNotes);
  }
}
