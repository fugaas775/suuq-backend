import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import {
  GetBillInterventionsDto,
  ReopenSettledBillDto,
  SplitOpenBillDto,
  VoidSettledBillDto,
} from './dto/bill-actions.dto';
import {
  GetKitchenQueueDto,
  HospitalityTicketActionDto,
} from './dto/kitchen-queue.dto';
import {
  AssignTableOwnerDto,
  GetTableBoardDto,
  UpdateTableStatusDto,
} from './dto/table-board.dto';
import { HospitalityWorkflowsService } from './hospitality-workflows.service';

@ApiTags('POS Hospitality Workflows')
@Controller('pos/v1/branches/:branchId')
@UseGuards(JwtAuthGuard)
export class HospitalityWorkflowsController {
  constructor(
    private readonly hospitalityWorkflowsService: HospitalityWorkflowsService,
  ) {}

  @Get('kitchen/queue')
  async getKitchenQueue(
    @Param('branchId') branchId: string,
    @Query() query: GetKitchenQueueDto,
  ) {
    return this.hospitalityWorkflowsService.getKitchenQueue(
      Number(branchId),
      query,
    );
  }

  @Post('kitchen/tickets/:ticketId/actions/:action')
  async mutateKitchenTicket(
    @Param('branchId') branchId: string,
    @Param('ticketId') ticketId: string,
    @Param('action') action: string,
    @Body() dto: HospitalityTicketActionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalityWorkflowsService.mutateKitchenTicket(
      Number(branchId),
      ticketId,
      action,
      dto,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
      },
    );
  }

  @Get('tables/board')
  async getTableBoard(
    @Param('branchId') branchId: string,
    @Query() query: GetTableBoardDto,
  ) {
    return this.hospitalityWorkflowsService.getTableBoard(
      Number(branchId),
      query,
    );
  }

  @Get('bills/interventions')
  async getBillInterventions(
    @Param('branchId') branchId: string,
    @Query() query: GetBillInterventionsDto,
  ) {
    return this.hospitalityWorkflowsService.getBillInterventions(
      Number(branchId),
      query,
    );
  }

  @Patch('tables/:tableId/status')
  async updateTableStatus(
    @Param('branchId') branchId: string,
    @Param('tableId') tableId: string,
    @Body() dto: UpdateTableStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalityWorkflowsService.updateTableStatus(
      Number(branchId),
      tableId,
      dto,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
      },
    );
  }

  @Patch('tables/:tableId/owner')
  async assignTableOwner(
    @Param('branchId') branchId: string,
    @Param('tableId') tableId: string,
    @Body() dto: AssignTableOwnerDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalityWorkflowsService.assignTableOwner(
      Number(branchId),
      tableId,
      dto,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
      },
    );
  }

  @Post('bills/:billId/split')
  async splitOpenBill(
    @Param('branchId') branchId: string,
    @Param('billId') billId: string,
    @Body() dto: SplitOpenBillDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalityWorkflowsService.splitOpenBill(
      Number(branchId),
      billId,
      dto,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
      },
    );
  }

  @Post('bills/:billId/reopen')
  async reopenSettledBill(
    @Param('branchId') branchId: string,
    @Param('billId') billId: string,
    @Body() dto: ReopenSettledBillDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalityWorkflowsService.reopenSettledBill(
      Number(branchId),
      billId,
      dto,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
      },
    );
  }

  @Post('bills/:billId/void')
  async voidSettledBill(
    @Param('branchId') branchId: string,
    @Param('billId') billId: string,
    @Body() dto: VoidSettledBillDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalityWorkflowsService.voidSettledBill(
      Number(branchId),
      billId,
      dto,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
      },
    );
  }
}
