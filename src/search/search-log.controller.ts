import {
  Body,
  Controller,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SearchLogService } from './search-log.service';
import { SearchLogDto } from './dto/search-log.dto';
import { AuthenticatedRequest } from '../auth/auth.types';

@Controller('search/log')
export class SearchLogController {
  constructor(private readonly searchLogService: SearchLogService) {}

  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async log(@Body() dto: SearchLogDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id ?? null;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      null;
    const ua = req.headers['user-agent'] || null;
    return this.searchLogService.log(dto, { userId, ip, ua });
  }
}
