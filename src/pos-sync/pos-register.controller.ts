import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PosBranchAccessGuard,
  grantedOnlyLowTier,
  grantedPermission,
} from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { RequirePosPermissions } from '../auth/decorators/require-pos-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { ClosePosRegisterSessionDto } from './dto/close-pos-register-session.dto';
import { CreatePosRegisterSessionDto } from './dto/create-pos-register-session.dto';
import { CreatePosSuspendedCartDto } from './dto/create-pos-suspended-cart.dto';
import { GetPosSuspendedCartQueryDto } from './dto/get-pos-suspended-cart-query.dto';
import { ListPosRegisterSessionsQueryDto } from './dto/list-pos-register-sessions-query.dto';
import { ListPosSuspendedCartsQueryDto } from './dto/list-pos-suspended-carts-query.dto';
import {
  PosRegisterSessionPageResponseDto,
  PosRegisterSessionResponseDto,
} from './dto/pos-register-session-response.dto';
import {
  PosSuspendedCartPageResponseDto,
  PosSuspendedCartResponseDto,
} from './dto/pos-suspended-cart-response.dto';
import { TransitionPosSuspendedCartDto } from './dto/transition-pos-suspended-cart.dto';
import { UpdatePosSuspendedCartDto } from './dto/update-pos-suspended-cart.dto';
import { PosRegisterService } from './pos-register.service';

/**
 * Every permission the discard route accepts EXCEPT parking a sale. Holding
 * any one of these is the authority to void a held cart that is not yours; a
 * caller who came in on SUSPEND_SALE alone (the QSR waiter preset, the vehicle
 * desk) may only discard their own — see PosRegisterService.discardSuspendedCart.
 */
const DISCARD_ANY_CART_PERMISSIONS = [
  'DISCARD_SUSPENDED_SALE',
  'SETTLE_TABLE_FOLIO',
  'SETTLE_ROOM_FOLIO',
  'SETTLE_FEE_PAYMENT',
  'VOID_STUDENT_FOLIO',
] as const;

/**
 * Holding any one of these is the authority to write a held cart that is not
 * yours — the counter's settle and part payments, a folio desk, the school
 * office and fee desk. A caller holding none of them (and not the owner or a
 * manager) came in on SUSPEND_SALE or MARK_KITCHEN_TICKET_READY alone — the
 * QSR waiter, the cook, the vehicle desk — and the service holds their PATCH
 * to their own orders plus the few hand-overs the floor makes between staff.
 */
const PATCH_ANY_CART_PERMISSIONS = [
  ...DISCARD_ANY_CART_PERMISSIONS,
  'OPEN_ROOM_FOLIO',
  'VIEW_FOLIO_BOARD',
  'ENROL_STUDENT',
  'POST_FEE_CHARGE',
] as const;

@ApiTags('POS Register')
@Controller('pos/v1/register')
export class PosRegisterController {
  constructor(private readonly posRegisterService: PosRegisterService) {}

  @Get('sessions')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOkResponse({ type: PosRegisterSessionPageResponseDto })
  findSessions(@Query() query: ListPosRegisterSessionsQueryDto) {
    return this.posRegisterService.findSessions(query);
  }

  @Post('sessions')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
  @RequirePosPermissions('OPEN_REGISTER')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiOkResponse({ type: PosRegisterSessionResponseDto })
  openSession(@Body() dto: CreatePosRegisterSessionDto, @Req() req) {
    return this.posRegisterService.openSession(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      // The opening-time rule lets a manager through; see openSession.
      roles: Array.isArray(req.user?.roles) ? req.user.roles : [],
    });
  }

  @Post('sessions/:id/close')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
  @RequirePosPermissions('CLOSE_REGISTER')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiOkResponse({ type: PosRegisterSessionResponseDto })
  closeSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ClosePosRegisterSessionDto,
    @Req() req,
  ) {
    return this.posRegisterService.closeSession(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }

  @Get('suspended-carts')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOkResponse({ type: PosSuspendedCartPageResponseDto })
  async findSuspendedCarts(
    @Query() query: ListPosSuspendedCartsQueryDto,
    @Req() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    // The register's poll: a tag from one aggregate, a 304 before any row
    // is read when the till already holds this version. The ETag set here
    // is the one the global interceptor leaves alone.
    const result = await this.posRegisterService.findSuspendedCartsConditional(
      query,
      req?.headers?.['if-none-match'],
    );
    res.setHeader('ETag', result.etag);
    if (result.notModified) {
      res.status(304);
      return undefined;
    }
    return result.page;
  }

  /**
   * One folio, read fresh — any status — behind exactly the list's door.
   *
   * The office plans every write against the row as it stands NOW: a roll
   * loaded an hour ago no longer holds the payment the till took since, and
   * re-reading one pupil used to mean re-paging the whole list (SMAG's runner
   * scripts did exactly that, because this route 404'd). Answered only for a
   * row on the branch named in the query; anything else is a 404, so an id
   * guessed from another school reads nothing.
   *
   * Declared after the list and on GET only, so it shadows no literal route:
   * every other `suspended-carts/:id/...` path is a POST or a PATCH.
   */
  @Get('suspended-carts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOkResponse({ type: PosSuspendedCartResponseDto })
  findSuspendedCart(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: GetPosSuspendedCartQueryDto,
  ) {
    return this.posRegisterService.findSuspendedCartOnBranch(
      id,
      query.branchId,
    );
  }

  @Post('suspended-carts')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
  // ENROL_STUDENT is the SCHOOL fee-desk equivalent: a school operator holding
  // only the school permissions holds none of the three above, and every
  // student folio is created and re-saved through this route. OR-semantics, so
  // this is additive for every other format.
  @RequirePosPermissions(
    'SUSPEND_SALE',
    'OPEN_ROOM_FOLIO',
    'VIEW_FOLIO_BOARD',
    'ENROL_STUDENT',
  )
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiOkResponse({ type: PosSuspendedCartResponseDto })
  suspendCart(@Body() dto: CreatePosSuspendedCartDto, @Req() req) {
    return this.posRegisterService.suspendCart(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      // Enrolling a pupil is the office's — see suspendCart.
      roles: Array.isArray(req.user?.roles) ? req.user.roles : [],
    });
  }

  @Patch('suspended-carts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
  // ENROL_STUDENT is the SCHOOL fee-desk equivalent: a school operator holding
  // only the school permissions holds none of the three above, and every
  // student folio is created and re-saved through this route. OR-semantics, so
  // this is additive for every other format.
  //
  // POST_FEE_CHARGE rides here too, and only here. SCHOOL edits a folio IN PLACE
  // (the format is in the frontend's _editInPlace list), so posting next term's
  // tuition is a PATCH of this row rather than a POST of a new one. Without it,
  // granting a clerk POST_FEE_CHARGE alone renders the "Charge next term" button
  // and then 403s the save — a permission that hands out a button it cannot use.
  //
  // SETTLE_FEE_PAYMENT for the same reason, and with money at stake. Taking a
  // fee is TWO calls: POST /checkouts/ingest books it (role-gated only, no
  // permission required), then this route writes it onto the pupil. A clerk
  // holding exactly the fee-desk verb could therefore bank a payment and be
  // refused the record of it — the receipt prints, the cash is counted, and the
  // folio still reads the full term as owed. SMAK lost an ETB 2,000 payment that
  // way on 2026-08-19 (three 403s against folio 16867, on a stale operator token
  // whose roster grant had since been widened) and the till reported the child
  // paid up. Settling a fee has to imply the right to write it down.
  //
  // MARK_KITCHEN_TICKET_READY is the QSR cook's, and it is here for the same
  // reason POST_FEE_CHARGE is. A QSR kitchen display is derived from the order
  // itself rather than from a ticket table, so "this station's food is up" is
  // written to `metadata` on THIS route. A cook lane holds exactly one
  // permission by design (it can neither park a basket nor open a folio), so
  // without this entry the board renders, the cook taps Ready, and the tap
  // 403s — the pass believing food is served while every other screen still
  // shows it cooking. Nothing else on the row is writable by that permission:
  // metadata is shallow-merged per top-level key, and the cook writes only its
  // own `qsrKitchen:<STATION>` one.
  @RequirePosPermissions(
    'SUSPEND_SALE',
    'OPEN_ROOM_FOLIO',
    'VIEW_FOLIO_BOARD',
    'ENROL_STUDENT',
    'POST_FEE_CHARGE',
    'SETTLE_FEE_PAYMENT',
    'MARK_KITCHEN_TICKET_READY',
  )
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiOkResponse({ type: PosSuspendedCartResponseDto })
  // The actor rides along for one reason: turning a stored PUPIL into
  // something that is not a pupil (another format, or no name) is the first
  // half of a withdrawal, and it needs the withdrawer's right — see
  // PosRegisterService.updateSuspendedCart.
  updateSuspendedCart(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePosSuspendedCartDto,
    @Req() req,
  ) {
    return this.posRegisterService.updateSuspendedCart(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      // A platform admin edits a pupil's record like the owner (see
      // school-pupil-record.policy); the roles are how the service knows.
      roles: Array.isArray(req.user?.roles) ? req.user.roles : [],
      limitedWriter: grantedOnlyLowTier(req, PATCH_ANY_CART_PERMISSIONS)
        ? {
            mayMarkKitchen: grantedPermission(req, 'MARK_KITCHEN_TICKET_READY'),
          }
        : null,
    });
  }

  @Post('suspended-carts/:id/resume')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
  @RequirePosPermissions(
    'RESUME_SUSPENDED_SALE',
    'OPEN_ROOM_FOLIO',
    'VIEW_FOLIO_BOARD',
    'VIEW_CLASS_BOARD',
  )
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiOkResponse({ type: PosSuspendedCartResponseDto })
  resumeSuspendedCart(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransitionPosSuspendedCartDto,
    @Req() req,
  ) {
    return this.posRegisterService.resumeSuspendedCart(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }

  @Post('suspended-carts/:id/ack-kitchen-cancellations')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
  @RequirePosPermissions('MARK_KITCHEN_TICKET_READY')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiOkResponse({ type: PosSuspendedCartResponseDto })
  ackKitchenCancellations(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransitionPosSuspendedCartDto,
  ) {
    return this.posRegisterService.ackKitchenCancellations(id, dto);
  }

  @Post('suspended-carts/:id/discard')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
  // SUSPEND_SALE is here so a waiter can clear their OWN rows (the sources
  // of a merge) and turn down a customer's pending order. It is not authority
  // over anyone else's cart: a caller holding nothing but it is held to their
  // own by the service (ownCartsOnly below).
  @RequirePosPermissions(...DISCARD_ANY_CART_PERMISSIONS, 'SUSPEND_SALE')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiOkResponse({ type: PosSuspendedCartResponseDto })
  discardSuspendedCart(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransitionPosSuspendedCartDto,
    @Req() req,
  ) {
    return this.posRegisterService.discardSuspendedCart(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      ownCartsOnly: grantedOnlyLowTier(req, DISCARD_ANY_CART_PERMISSIONS),
    });
  }
}
