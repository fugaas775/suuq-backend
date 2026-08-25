import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
import { PosPurchasingPermission } from './permissions/pos-purchasing-permission.enum';
import {
  CreatePurchaseRunDto,
  DecidePurchaseRunDto,
  IssuePurchaseAdvanceDto,
  ListCashMovementsQueryDto,
  ListPurchaseRunsQueryDto,
  PurchasePriceHistoryQueryDto,
  SubmitPurchaseRunDto,
  UpdatePurchaseRunDto,
} from './dto/purchasing.dto';
import { PurchasingActor, PurchasingService } from './purchasing.service';

const GUARDS = [
  JwtAuthGuard,
  RolesGuard,
  RetailModulesGuard,
  PosBranchAccessGuard,
];

/** Either of the two codes that may READ a run. */
const READ_PERMISSIONS = [
  PosPurchasingPermission.FILE_PURCHASE_RUN,
  PosPurchasingPermission.APPROVE_PURCHASE_RUN,
] as const;

/**
 * The market run.
 *
 * Every write names exactly the one authority it exercises, which is the point
 * of splitting the codes: a purchaser's token reaches `submit` and bounces off
 * `approve`, and a cashier's token reaches `advance` and neither of the others.
 *
 * POS_OPERATOR is in the role list — unlike payroll, and for the opposite
 * reason. A purchaser IS an operator; the whole lane exists for somebody who is
 * not a manager. The per-route permission is what does the separating here.
 */
@ApiTags('Purchasing')
@Controller('pos/v1/purchasing')
@UseGuards(...GUARDS)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class PurchasingController {
  constructor(private readonly svc: PurchasingService) {}

  /**
   * Who is asking, and may they sign.
   *
   * `canApprove` mirrors the guard's own `isManagerLike` test plus the explicit
   * code, because the guard answers "may this request proceed" and the service
   * needs a second, different answer: "does this person see the whole branch's
   * runs, or only their own". An owner and a manager see everything; an operator
   * granted APPROVE_PURCHASE_RUN sees everything too, since a queue you cannot
   * read is a queue you cannot work.
   */
  private actorFrom(req: AuthenticatedRequest): PurchasingActor {
    const user = (req.user ?? {}) as Record<string, unknown>;
    const roles = Array.isArray(user.roles)
      ? (user.roles as string[]).map((role) =>
          String(role || '')
            .trim()
            .toUpperCase(),
        )
      : [];
    const permissions = Array.isArray(user.permissions)
      ? (user.permissions as string[]).map((permission) =>
          String(permission || '')
            .replace(/[^A-Za-z0-9_]/g, '')
            .trim()
            .toUpperCase(),
        )
      : [];
    const branchRole = String(user.branchRole || '')
      .trim()
      .toUpperCase();

    const isManagerLike =
      user.isOwner === true ||
      user.isTenantOwner === true ||
      branchRole === 'MANAGER' ||
      roles.some((role) =>
        ['SUPER_ADMIN', 'ADMIN', 'POS_MANAGER'].includes(role),
      );

    return {
      userId: Number(user.id) || null,
      name:
        (typeof user.displayName === 'string' && user.displayName.trim()) ||
        (typeof user.email === 'string' && user.email.trim()) ||
        null,
      canApprove:
        isManagerLike ||
        permissions.includes(PosPurchasingPermission.APPROVE_PURCHASE_RUN),
    };
  }

  // ── Runs ─────────────────────────────────────────────────────────────────

  @Get('runs')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...READ_PERMISSIONS)
  listRuns(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListPurchaseRunsQueryDto,
  ) {
    return this.svc.listRuns(query, this.actorFrom(req));
  }

  @Get('runs/:id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...READ_PERMISSIONS)
  getRun(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.svc.getRun(id, branchId, this.actorFrom(req));
  }

  @Post('runs')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPurchasingPermission.FILE_PURCHASE_RUN)
  createRun(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePurchaseRunDto,
  ) {
    return this.svc.createRun(dto, this.actorFrom(req));
  }

  @Patch('runs/:id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPurchasingPermission.FILE_PURCHASE_RUN)
  updateRun(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseRunDto,
  ) {
    return this.svc.updateRun(id, dto, this.actorFrom(req));
  }

  @Delete('runs/:id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosPurchasingPermission.FILE_PURCHASE_RUN)
  deleteRun(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.svc.deleteRun(id, branchId, this.actorFrom(req));
  }

  @Post('runs/:id/submit')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPurchasingPermission.FILE_PURCHASE_RUN)
  submitRun(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitPurchaseRunDto,
  ) {
    return this.svc.submitRun(id, dto, this.actorFrom(req));
  }

  // ── The signature ────────────────────────────────────────────────────────

  @Post('runs/:id/approve')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPurchasingPermission.APPROVE_PURCHASE_RUN)
  approveRun(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidePurchaseRunDto,
  ) {
    return this.svc.approveRun(id, dto, this.actorFrom(req));
  }

  @Post('runs/:id/reject')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPurchasingPermission.APPROVE_PURCHASE_RUN)
  rejectRun(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidePurchaseRunDto,
  ) {
    return this.svc.rejectRun(id, dto, this.actorFrom(req));
  }

  @Post('runs/:id/void')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPurchasingPermission.APPROVE_PURCHASE_RUN)
  voidRun(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidePurchaseRunDto,
  ) {
    return this.svc.voidRun(id, dto, this.actorFrom(req));
  }

  // ── The drawer ───────────────────────────────────────────────────────────

  @Post('runs/:id/advance')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPurchasingPermission.ISSUE_PURCHASE_ADVANCE)
  issueAdvance(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssuePurchaseAdvanceDto,
  ) {
    return this.svc.issueAdvance(id, dto, this.actorFrom(req));
  }

  /**
   * Cash through the drawer with no sale behind it.
   *
   * Readable by anyone who can work a register, not only by purchasing: this is
   * what the close-of-shift screen subtracts to get the expected cash, and a
   * cashier who cannot read it counts against the wrong number.
   */
  @Get('cash-movements')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosPurchasingPermission.FILE_PURCHASE_RUN,
    PosPurchasingPermission.APPROVE_PURCHASE_RUN,
    PosPurchasingPermission.ISSUE_PURCHASE_ADVANCE,
    'OPEN_REGISTER',
    'CLOSE_REGISTER',
  )
  listCashMovements(@Query() query: ListCashMovementsQueryDto) {
    return this.svc.listCashMovements(query);
  }

  // ── What things cost ─────────────────────────────────────────────────────

  @Get('price-history')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...READ_PERMISSIONS)
  priceHistory(@Query() query: PurchasePriceHistoryQueryDto) {
    return this.svc.priceHistory(query);
  }
}
