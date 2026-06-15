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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { EquityPartnerBnplAccountKind } from './entities/equity-partner-bnpl-activation.entity';
import {
  EquityPartnerBnplService,
  StartBnplActivationInput,
} from './equity-partner-bnpl.service';

class StartEquityBnplActivationDto implements StartBnplActivationInput {
  @IsOptional()
  @IsIn(['BRANCH', 'SUPPLIER'])
  accountKind?: EquityPartnerBnplAccountKind;

  @IsEmail()
  targetOwnerEmail!: string;

  @IsIn(['ONE_YEAR'])
  period!: 'ONE_YEAR';

  // Branch-only — required unless funding a supplier account.
  @ValidateIf((o) => o.accountKind !== 'SUPPLIER')
  @IsString()
  @IsNotEmpty()
  branchName?: string;

  @ValidateIf((o) => o.accountKind !== 'SUPPLIER')
  @IsString()
  @IsNotEmpty()
  serviceFormat?: string;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  country?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  tinNumber?: string | null;

  // Supplier-only — required when funding a supplier account.
  @ValidateIf((o) => o.accountKind === 'SUPPLIER')
  @IsString()
  @IsNotEmpty()
  supplierCompanyName?: string;

  @IsOptional()
  @IsString()
  legalName?: string | null;

  @IsOptional()
  @IsString()
  taxId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  countriesServed?: string[];
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

  /** Pricing + period options to populate the partner UI (branch or supplier). */
  @Get('options')
  options(@Query('kind') kind?: string) {
    const accountKind: EquityPartnerBnplAccountKind =
      String(kind || '').toUpperCase() === 'SUPPLIER' ? 'SUPPLIER' : 'BRANCH';
    return { options: this.bnplService.getSubscriptionOptions(accountKind) };
  }

  /** List the partner's BNPL activations (all statuses). */
  @Get('activations')
  list(@Req() req: AuthenticatedRequest) {
    return this.bnplService.listOutstandingForPartner(req.user.id);
  }

  /** List the partner's BNPL credit ledger entries. */
  @Get('credit-ledger')
  listCreditLedger(@Req() req: AuthenticatedRequest) {
    return this.bnplService.listCreditLedgerForPartner(req.user.id);
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

  /** Cancel an outstanding BNPL activation (releases the BNPL slot). */
  @Delete('activations/:id/cancel')
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.bnplService.cancelBnplActivation(req.user.id, id);
  }
}
