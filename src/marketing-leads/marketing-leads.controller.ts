import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CreateMarketingLeadDto } from './dto/create-marketing-lead.dto';
import { MarketingLeadsService } from './marketing-leads.service';

@Controller('leads')
export class MarketingLeadsController {
  constructor(private readonly marketingLeadsService: MarketingLeadsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLead(
    @Body() payload: CreateMarketingLeadDto,
    @Ip() ip: string,
    @Req() request: Request,
  ) {
    return this.marketingLeadsService.captureLead(payload, {
      ip,
      referer: request.headers.referer || '',
      userAgent: request.headers['user-agent'] || '',
    });
  }
}
