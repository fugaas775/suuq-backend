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
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PartnerCredentialsService } from '../partner-credentials/partner-credentials.service';
import {
  PartnerPosRegisterReadGuard,
  PartnerPosRegisterWriteGuard,
} from '../partner-credentials/partner-credential-scoped.guard';
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
import { PosRegisterSessionStatus } from './entities/pos-register-session.entity';
import { PosSuspendedCartStatus } from './entities/pos-suspended-cart.entity';
import { PosRegisterService } from './pos-register.service';

const PARTNER_REGISTER_UNAUTHORIZED_RESPONSE = {
  description:
    'Partner credential is missing the required scope or is bound to another branch.',
  content: {
    'application/json': {
      examples: {
        missingScope: {
          summary: 'Missing register scope',
          value: {
            statusCode: 401,
            message:
              'Partner credential is missing required POS scope: pos:register:write',
            error: 'Unauthorized',
          },
        },
        wrongBranch: {
          summary: 'Branch mismatch',
          value: {
            statusCode: 401,
            message: 'Partner credential is not authorized for branch 4',
            error: 'Unauthorized',
          },
        },
      },
    },
  },
} as const;

@ApiTags('POS Partner Register')
@Controller('pos/v1/register')
export class PosPartnerRegisterController {
  constructor(
    private readonly posRegisterService: PosRegisterService,
    private readonly partnerCredentialsService: PartnerCredentialsService,
  ) {}

  @Get('partner-sessions')
  @UseGuards(PartnerPosRegisterReadGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiUnauthorizedResponse(PARTNER_REGISTER_UNAUTHORIZED_RESPONSE)
  @ApiOkResponse({
    type: PosRegisterSessionPageResponseDto,
    content: {
      'application/json': {
        examples: {
          activeSessions: {
            summary: 'Partner register session page',
            value: {
              items: [
                {
                  id: 11,
                  branchId: 3,
                  registerId: 'front-1',
                  status: PosRegisterSessionStatus.OPEN,
                  openedAt: '2026-04-01T09:00:00.000Z',
                  closedAt: null,
                  openedByUserId: null,
                  openedByName: 'Lane 1 POS',
                  closedByUserId: null,
                  closedByName: null,
                  note: null,
                  metadata: { deviceLabel: 'Counter 1' },
                  createdAt: '2026-04-01T09:00:00.000Z',
                  updatedAt: '2026-04-01T09:00:00.000Z',
                },
              ],
              total: 1,
              page: 1,
              perPage: 20,
              totalPages: 1,
            },
          },
        },
      },
    },
  })
  findSessions(
    @Query() query: ListPosRegisterSessionsQueryDto,
    @Req() req: any,
  ) {
    this.partnerCredentialsService.assertCredentialBranchAccess(
      req.partnerCredential,
      query.branchId,
    );

    return this.posRegisterService.findSessions(query);
  }

  @Post('partner-sessions')
  @UseGuards(PartnerPosRegisterWriteGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiBody({
    type: CreatePosRegisterSessionDto,
    examples: {
      openSession: {
        summary: 'Open a partner register session',
        value: {
          branchId: 3,
          registerId: 'front-1',
          note: 'Morning shift',
          metadata: { deviceLabel: 'Counter 1' },
        },
      },
    },
  })
  @ApiUnauthorizedResponse(PARTNER_REGISTER_UNAUTHORIZED_RESPONSE)
  @ApiCreatedResponse({
    type: PosRegisterSessionResponseDto,
    content: {
      'application/json': {
        examples: {
          openedSession: {
            summary: 'Partner register session opened',
            value: {
              id: 11,
              branchId: 3,
              registerId: 'front-1',
              status: PosRegisterSessionStatus.OPEN,
              openedAt: '2026-04-01T09:00:00.000Z',
              closedAt: null,
              openedByUserId: null,
              openedByName: 'Lane 1 POS',
              closedByUserId: null,
              closedByName: null,
              note: null,
              metadata: { deviceLabel: 'Counter 1' },
              createdAt: '2026-04-01T09:00:00.000Z',
              updatedAt: '2026-04-01T09:00:00.000Z',
            },
          },
        },
      },
    },
  })
  openSession(@Body() dto: CreatePosRegisterSessionDto, @Req() req: any) {
    this.partnerCredentialsService.assertCredentialBranchAccess(
      req.partnerCredential,
      dto.branchId,
    );

    return this.posRegisterService.openSession(dto, {
      id: null,
      email: null,
    });
  }

  @Post('partner-sessions/:id/close')
  @UseGuards(PartnerPosRegisterWriteGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiBody({
    type: ClosePosRegisterSessionDto,
    examples: {
      closeSession: {
        summary: 'Close a partner register session',
        value: {
          branchId: 3,
          note: 'Shift complete',
          metadata: { closingFloat: 120 },
        },
      },
    },
  })
  @ApiUnauthorizedResponse(PARTNER_REGISTER_UNAUTHORIZED_RESPONSE)
  @ApiCreatedResponse({ type: PosRegisterSessionResponseDto })
  closeSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ClosePosRegisterSessionDto,
    @Req() req: any,
  ) {
    this.partnerCredentialsService.assertCredentialBranchAccess(
      req.partnerCredential,
      dto.branchId,
    );

    return this.posRegisterService.closeSession(id, dto, {
      id: null,
      email: null,
    });
  }

  @Get('partner-suspended-carts')
  @UseGuards(PartnerPosRegisterReadGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiUnauthorizedResponse(PARTNER_REGISTER_UNAUTHORIZED_RESPONSE)
  @ApiOkResponse({
    type: PosSuspendedCartPageResponseDto,
    content: {
      'application/json': {
        examples: {
          suspendedCartPage: {
            summary: 'Partner suspended cart page',
            value: {
              items: [
                {
                  id: 91,
                  branchId: 3,
                  registerSessionId: 11,
                  registerId: 'front-1',
                  label: 'Lane 2 basket',
                  status: PosSuspendedCartStatus.SUSPENDED,
                  currency: 'USD',
                  promoCode: null,
                  itemCount: 1,
                  total: 15,
                  note: null,
                  cartSnapshot: { items: [] },
                  metadata: { heldFor: 'customer-return' },
                  suspendedByUserId: null,
                  suspendedByName: 'Lane 1 POS',
                  resumedAt: null,
                  resumedByUserId: null,
                  resumedByName: null,
                  discardedAt: null,
                  discardedByUserId: null,
                  discardedByName: null,
                  createdAt: '2026-04-01T11:00:00.000Z',
                  updatedAt: '2026-04-01T11:00:00.000Z',
                },
              ],
              total: 1,
              page: 1,
              perPage: 20,
              totalPages: 1,
            },
          },
        },
      },
    },
  })
  findSuspendedCarts(
    @Query() query: ListPosSuspendedCartsQueryDto,
    @Req() req: any,
  ) {
    this.partnerCredentialsService.assertCredentialBranchAccess(
      req.partnerCredential,
      query.branchId,
    );

    return this.posRegisterService.findSuspendedCarts(query);
  }

  @Post('partner-suspended-carts')
  @UseGuards(PartnerPosRegisterWriteGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiBody({
    type: CreatePosSuspendedCartDto,
    examples: {
      suspendCart: {
        summary: 'Suspend a cart from a partner register',
        value: {
          branchId: 3,
          registerSessionId: 11,
          registerId: 'front-1',
          label: 'Lane 2 basket',
          currency: 'USD',
          itemCount: 1,
          total: 15,
          cartSnapshot: { items: [] },
          metadata: { heldFor: 'customer-return' },
        },
      },
    },
  })
  @ApiUnauthorizedResponse(PARTNER_REGISTER_UNAUTHORIZED_RESPONSE)
  @ApiCreatedResponse({
    type: PosSuspendedCartResponseDto,
    content: {
      'application/json': {
        examples: {
          suspendedCart: {
            summary: 'Partner cart suspended',
            value: {
              id: 91,
              branchId: 3,
              registerSessionId: 11,
              registerId: 'front-1',
              label: 'Lane 2 basket',
              status: PosSuspendedCartStatus.SUSPENDED,
              currency: 'USD',
              promoCode: null,
              itemCount: 1,
              total: 15,
              note: null,
              cartSnapshot: { items: [] },
              metadata: { heldFor: 'customer-return' },
              suspendedByUserId: null,
              suspendedByName: 'Lane 1 POS',
              resumedAt: null,
              resumedByUserId: null,
              resumedByName: null,
              discardedAt: null,
              discardedByUserId: null,
              discardedByName: null,
              createdAt: '2026-04-01T11:00:00.000Z',
              updatedAt: '2026-04-01T11:00:00.000Z',
            },
          },
        },
      },
    },
  })
  suspendCart(@Body() dto: CreatePosSuspendedCartDto, @Req() req: any) {
    this.partnerCredentialsService.assertCredentialBranchAccess(
      req.partnerCredential,
      dto.branchId,
    );

    return this.posRegisterService.suspendCart(dto, {
      id: null,
      email: null,
    });
  }

  @Post('partner-suspended-carts/:id/resume')
  @UseGuards(PartnerPosRegisterWriteGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiBody({
    type: TransitionPosSuspendedCartDto,
    examples: {
      resumeCart: {
        summary: 'Resume a suspended cart',
        value: {
          branchId: 3,
        },
      },
    },
  })
  @ApiUnauthorizedResponse(PARTNER_REGISTER_UNAUTHORIZED_RESPONSE)
  @ApiCreatedResponse({ type: PosSuspendedCartResponseDto })
  resumeSuspendedCart(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransitionPosSuspendedCartDto,
    @Req() req: any,
  ) {
    this.partnerCredentialsService.assertCredentialBranchAccess(
      req.partnerCredential,
      dto.branchId,
    );

    return this.posRegisterService.resumeSuspendedCart(id, dto, {
      id: null,
      email: null,
    });
  }

  @Post('partner-suspended-carts/:id/discard')
  @UseGuards(PartnerPosRegisterWriteGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiBody({
    type: TransitionPosSuspendedCartDto,
    examples: {
      discardCart: {
        summary: 'Discard a suspended cart',
        value: {
          branchId: 3,
        },
      },
    },
  })
  @ApiUnauthorizedResponse(PARTNER_REGISTER_UNAUTHORIZED_RESPONSE)
  @ApiCreatedResponse({ type: PosSuspendedCartResponseDto })
  discardSuspendedCart(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransitionPosSuspendedCartDto,
    @Req() req: any,
  ) {
    this.partnerCredentialsService.assertCredentialBranchAccess(
      req.partnerCredential,
      dto.branchId,
    );

    return this.posRegisterService.discardSuspendedCart(id, dto, {
      id: null,
      email: null,
    });
  }
}
