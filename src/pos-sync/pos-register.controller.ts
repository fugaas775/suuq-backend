import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
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
import { PosRegisterService } from './pos-register.service';

@ApiTags('POS Register')
@Controller('pos/v1/register')
export class PosRegisterController {
  constructor(private readonly posRegisterService: PosRegisterService) {}

  @Get('sessions')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
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

  @Post('suspended-carts/:id/resume')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
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

  @Post('suspended-carts/:id/discard')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
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
