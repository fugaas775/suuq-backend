import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { EquityPartnerStatus } from './entities/equity-partner.entity';
import { EquityPayoutStatus } from './entities/equity-payout.entity';
import {
  MarkPayoutPaidDto,
  UpdateEquityPartnerDto,
  UpdateEquitySplitAssignmentDto,
} from './dto/equity-partner.dto';
import { EquityPartnerService } from './equity-partner.service';
import { EquityPartnerBnplService } from './equity-partner-bnpl.service';

@ApiTags('Admin Equity Partners')
@Controller('admin/equity-partners')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminEquityPartnersController {
  constructor(
    private readonly equityService: EquityPartnerService,
    private readonly bnplService: EquityPartnerBnplService,
  ) {}

  @Get()
  list(@Query('status') status?: EquityPartnerStatus) {
    return this.equityService.listPartners(status ? { status } : undefined);
  }

  @Get(':id')
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.equityService.getPartnerById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEquityPartnerDto,
  ) {
    return this.equityService.updatePartner(id, dto);
  }

  @Get(':id/payouts')
  listPayouts(
    @Param('id', ParseIntPipe) id: number,
    @Query('status') status?: EquityPayoutStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.equityService.listPayouts(id, {
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get('payouts/all')
  listAllPayouts(
    @Query('status') status?: EquityPayoutStatus,
    @Query('partnerId') partnerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.equityService.listAllPayouts({
      status,
      partnerId: partnerId ? Number(partnerId) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Patch(':id/assignments/:assignmentId')
  updateAssignmentSplit(
    @Param('id', ParseIntPipe) id: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Body() dto: UpdateEquitySplitAssignmentDto,
  ) {
    return this.equityService.updateAssignmentSplit(id, assignmentId, dto);
  }

  @Post(':id/payouts/:payoutId/mark-paid')
  markPaid(
    @Param('id', ParseIntPipe) id: number,
    @Param('payoutId', ParseIntPipe) payoutId: number,
    @Body() dto: MarkPayoutPaidDto,
  ) {
    return this.equityService.markPayoutPaid(id, payoutId, dto.notes);
  }

  // ---------------------------------------------------------------------------
  // Equity-partner BNPL management
  // ---------------------------------------------------------------------------

  /** List all BNPL activations (any status) for the given partner. */
  @Get(':id/bnpl-activations')
  listBnpl(@Param('id', ParseIntPipe) id: number) {
    return this.bnplService.listForPartnerAdmin(id);
  }

  /** List BNPL credit-ledger entries for the given partner. */
  @Get(':id/bnpl-credit-ledger')
  listBnplCreditLedger(@Param('id', ParseIntPipe) id: number) {
    return this.bnplService.listCreditLedgerForPartnerAdmin(id);
  }

  /** Update the partner's simultaneous-OUTSTANDING BNPL credit limit. */
  @Patch(':id/bnpl-credit-limit')
  setBnplLimit(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { limit: number },
  ) {
    return this.bnplService.setCreditLimit(id, Number(body.limit));
  }

  /** Forgive an outstanding BNPL activation (write-off). */
  @Post('bnpl-activations/:activationId/forgive')
  forgiveBnpl(
    @Param('activationId', ParseIntPipe) activationId: number,
    @Body() body: { note?: string },
  ) {
    return this.bnplService.forgive(activationId, body?.note);
  }

  /** Manually mark an outstanding BNPL activation as settled (offline). */
  @Post('bnpl-activations/:activationId/mark-settled')
  markBnplSettled(
    @Param('activationId', ParseIntPipe) activationId: number,
    @Body() body: { referenceId?: string },
  ) {
    return this.bnplService.markSettled(activationId, body?.referenceId);
  }

  /** Cancel an outstanding BNPL activation (admin-initiated). */
  @Delete('bnpl-activations/:activationId/cancel')
  cancelBnpl(@Param('activationId', ParseIntPipe) activationId: number) {
    return this.bnplService.cancelForAdmin(activationId);
  }

  /** Bulk delete equity partners. Must be declared before :id route. */
  @Delete('bulk')
  async bulkDeletePartners(@Body() body: { ids: number[] }) {
    if (!Array.isArray(body?.ids) || !body.ids.length) {
      throw new BadRequestException('ids must be a non-empty array');
    }
    const deleted = await this.equityService.bulkDeletePartners(body.ids);
    return { deleted };
  }

  /** Delete a single equity partner. */
  @Delete(':id')
  async deletePartner(@Param('id', ParseIntPipe) id: number) {
    await this.equityService.deletePartner(id);
    return { message: `Equity partner #${id} deleted.` };
  }
}
