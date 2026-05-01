import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  EquityPartnerBnplService,
  StartBnplActivationInput,
} from './equity-partner-bnpl.service';

class StartEquityBnplActivationDto implements StartBnplActivationInput {
  @IsString()
  @IsNotEmpty()
  branchName!: string;

  @IsString()
  @IsNotEmpty()
  serviceFormat!: string;

  @IsEmail()
  targetOwnerEmail!: string;

  @IsIn(['SIX_MONTHS', 'ONE_YEAR'])
  period!: 'SIX_MONTHS' | 'ONE_YEAR';

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  country?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;
}

class SettleEquityBnplActivationDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;
}

@ApiTags('Seller Equity BNPL')
@Controller('seller/v1/equity/bnpl')
@UseGuards(JwtAuthGuard)
export class SellerEquityBnplController {
  constructor(private readonly bnplService: EquityPartnerBnplService) {}

  /** Pricing + period options to populate the partner UI. */
  @Get('options')
  options() {
    return { options: this.bnplService.getSubscriptionOptions() };
  }

  /** List the partner's BNPL activations (all statuses). */
  @Get('activations')
  list(@Req() req: AuthenticatedRequest) {
    return this.bnplService.listOutstandingForPartner(req.user.id);
  }

  /** Create a new BNPL-funded branch on behalf of an end-user. */
  @Post('activate')
  activate(
    @Req() req: AuthenticatedRequest,
    @Body() dto: StartEquityBnplActivationDto,
  ) {
    return this.bnplService.startBnplActivation(req.user.id, dto);
  }

  /** Initiate Ebirr settlement for an outstanding activation. */
  @Post('activations/:id/settle')
  settle(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SettleEquityBnplActivationDto,
  ) {
    return this.bnplService.initiateSettlementPayment(
      req.user.id,
      id,
      dto.phoneNumber,
    );
  }
}
