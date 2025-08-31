import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PatchFavoritesDto } from './dto/patch-favorites.dto';
import { PutFavoritesDto } from './dto/put-favorites.dto';
import { Request, Response } from 'express';
import { RequiredHeadersGuard } from '../common/guards/required-headers.guard';
import { RateLimitInterceptor } from '../common/interceptors/rate-limit.interceptor';

@Controller('v1/favorites')
@UseGuards(JwtAuthGuard, RequiredHeadersGuard)
@UseInterceptors(new RateLimitInterceptor(30))
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  async get(
    @Req() req: Request,
    @Res() res: Response,
    @Query('include') include?: string,
    @Headers('if-none-match') ifNoneMatch?: string,
  ) {
    const userId = (req as any).user?.id as number;
    const includeProducts = include === 'products';
    const data = await this.favorites.get(userId, includeProducts);
    const etag = data.etag;
    res.setHeader('ETag', etag);
    res.setHeader('Content-Location', req.originalUrl || req.url);
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }
    return res.status(200).json(data);
  }

  @Patch()
  async patch(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('if-match') ifMatch: string | undefined,
    @Query('merge') merge: 'union' | 'server' | 'client',
    @Body() body: PatchFavoritesDto,
  ) {
    const userId = (req as any).user?.id as number;
    const dto = body;
    const data = await this.favorites.patch(
      userId,
      dto,
      ifMatch,
      merge ?? 'union',
    );
    res.setHeader('ETag', data.etag);
    res.setHeader('Content-Location', req.originalUrl || req.url);
    return res.status(200).json(data);
  }

  @Put()
  async put(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PutFavoritesDto,
  ) {
    const userId = (req as any).user?.id as number;
    const data = await this.favorites.put(userId, body, ifMatch);
    res.setHeader('ETag', data.etag);
    res.setHeader('Content-Location', req.originalUrl || req.url);
    return res.status(200).json(data);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@Req() req: Request): Promise<void> {
    const userId = (req as any).user?.id as number;
    await this.favorites.clear(userId);
  }

  @Get('contains')
  async contains(@Req() req: Request, @Query('ids') idsParam?: string) {
    if (!idsParam) throw new BadRequestException('ids query required');
    const ids = idsParam
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n));
    const userId = (req as any).user?.id as number;
    const contains = await this.favorites.contains(userId, ids);
    return { contains };
  }
}
