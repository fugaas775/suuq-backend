import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import {
  StorefrontListQueryDto,
  StorefrontProductsQueryDto,
  StorefrontHotelRoomsQueryDto,
} from './dto/storefront-query.dto';

/**
 * Public consumer-facing storefront endpoints.
 * No auth required — all routes are public read-only.
 * Mounted under /api/v2/stores.
 */
@Controller('v2/stores')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  /** List visible stores with optional city / serviceFormat filters. */
  @Get()
  @Header('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
  listStores(@Query() query: StorefrontListQueryDto) {
    return this.storefrontService.listStores(query);
  }

  /** Single store profile — id, name, serviceFormat, coverImageUrl, hours, address. */
  @Get(':storeId')
  @Header('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
  getStore(@Param('storeId', ParseIntPipe) storeId: number) {
    return this.storefrontService.getStore(storeId);
  }

  /** Paginated product catalog for the store (public). */
  @Get(':storeId/products')
  @Header('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=60')
  getStoreProducts(
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query() query: StorefrontProductsQueryDto,
  ) {
    return this.storefrontService.getStoreProducts(storeId, query);
  }

  /** Hotel room types for a HOTEL store. */
  @Get(':storeId/hotel/rooms')
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  getHotelRooms(
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query() query: StorefrontHotelRoomsQueryDto,
  ) {
    return this.storefrontService.getHotelRooms(storeId, query);
  }

  /** Rate plans for a HOTEL store. */
  @Get(':storeId/hotel/rate-plans')
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  getHotelRatePlans(@Param('storeId', ParseIntPipe) storeId: number) {
    return this.storefrontService.getHotelRatePlans(storeId);
  }

  /** Real-time room availability for given dates. */
  @Get(':storeId/hotel/availability')
  @Header('Cache-Control', 'public, s-maxage=0, must-revalidate')
  getHotelAvailability(
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query('checkInAt') checkInAt: string,
    @Query('checkOutAt') checkOutAt: string,
    @Query('roomType') roomType?: string,
  ) {
    return this.storefrontService.getHotelAvailability(
      storeId,
      checkInAt,
      checkOutAt,
      roomType,
    );
  }
}
