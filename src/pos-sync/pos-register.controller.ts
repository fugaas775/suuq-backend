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
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
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
  findSuspendedCarts(@Query() query: ListPosSuspendedCartsQueryDto) {
    return this.posRegisterService.findSuspendedCarts(query);
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
  @RequirePosPermissions(
    'SUSPEND_SALE',
    'OPEN_ROOM_FOLIO',
    'VIEW_FOLIO_BOARD',
    'ENROL_STUDENT',
    'POST_FEE_CHARGE',
    'SETTLE_FEE_PAYMENT',
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
  updateSuspendedCart(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePosSuspendedCartDto,
  ) {
    return this.posRegisterService.updateSuspendedCart(id, dto);
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
  @RequirePosPermissions(
    'DISCARD_SUSPENDED_SALE',
    'SETTLE_TABLE_FOLIO',
    'SETTLE_ROOM_FOLIO',
    'SUSPEND_SALE',
    'SETTLE_FEE_PAYMENT',
    'VOID_STUDENT_FOLIO',
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
  discardSuspendedCart(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransitionPosSuspendedCartDto,
    @Req() req,
  ) {
    return this.posRegisterService.discardSuspendedCart(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }
}
