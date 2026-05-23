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
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RequirePosPermissions } from '../auth/decorators/require-pos-permissions.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
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
import { PatchKitchenProductAvailabilityDto } from './dto/kitchen-product-availability.dto';
import { HospitalityWorkflowsService } from './hospitality-workflows.service';

@ApiTags('POS Hospitality Workflows')
@Controller('pos/v1/branches/:branchId')
@UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
)
@RequireRetailModules(RetailOsModule.POS_CORE)
@RetailBranchContext('params.branchId')
export class HospitalityWorkflowsController {
  constructor(
    private readonly hospitalityWorkflowsService: HospitalityWorkflowsService,
  ) {}

  @Get('kitchen/product-availability')
  async getKitchenProductAvailability(@Param('branchId') branchId: string) {
    return this.hospitalityWorkflowsService.getKitchenProductAvailability(
      Number(branchId),
    );
  }

  @Patch('kitchen/product-availability')
  async patchKitchenProductAvailability(
    @Param('branchId') branchId: string,
    @Body() dto: PatchKitchenProductAvailabilityDto,
  ) {
    return this.hospitalityWorkflowsService.patchKitchenProductAvailability(
      Number(branchId),
      dto,
    );
  }

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

  @Post('kitchen/tickets/:ticketId/actions/fire')
  @RequirePosPermissions('FIRE_KITCHEN_TICKET')
  async fireKitchenTicket(
    @Param('branchId') branchId: string,
    @Param('ticketId') ticketId: string,
    @Body() dto: HospitalityTicketActionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalityWorkflowsService.mutateKitchenTicket(
      Number(branchId),
      ticketId,
      'fire',
      dto,
      { id: req.user?.id ?? null, email: req.user?.email ?? null },
    );
  }

  @Post('kitchen/tickets/:ticketId/actions/hold')
  @RequirePosPermissions('HOLD_KITCHEN_TICKET')
  async holdKitchenTicket(
    @Param('branchId') branchId: string,
    @Param('ticketId') ticketId: string,
    @Body() dto: HospitalityTicketActionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalityWorkflowsService.mutateKitchenTicket(
      Number(branchId),
      ticketId,
      'hold',
      dto,
      { id: req.user?.id ?? null, email: req.user?.email ?? null },
    );
  }

  @Post('kitchen/tickets/:ticketId/actions/ready')
  @RequirePosPermissions('MARK_KITCHEN_TICKET_READY')
  async readyKitchenTicket(
    @Param('branchId') branchId: string,
    @Param('ticketId') ticketId: string,
    @Body() dto: HospitalityTicketActionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalityWorkflowsService.mutateKitchenTicket(
      Number(branchId),
      ticketId,
      'ready',
      dto,
      { id: req.user?.id ?? null, email: req.user?.email ?? null },
    );
  }

  @Post('kitchen/tickets/:ticketId/actions/handoff')
  @RequirePosPermissions('COMPLETE_KITCHEN_HANDOFF')
  async handoffKitchenTicket(
    @Param('branchId') branchId: string,
    @Param('ticketId') ticketId: string,
    @Body() dto: HospitalityTicketActionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalityWorkflowsService.mutateKitchenTicket(
      Number(branchId),
      ticketId,
      'handoff',
      dto,
      { id: req.user?.id ?? null, email: req.user?.email ?? null },
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
  @RequirePosPermissions('REOPEN_SETTLED_BILL')
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
  @RequirePosPermissions('VOID_SETTLED_BILL')
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
