import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LoginDto } from '../auth/dto/login.dto';
import { GoogleAuthDto } from '../auth/dto/google-auth.dto';
import { AppleAuthDto } from '../auth/dto/apple-auth.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { User } from '../users/entities/user.entity';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { BranchStaffService } from './branch-staff.service';
import {
  CreatePosWorkspaceDto,
  CreatePosWorkspaceResponseDto,
} from './dto/create-pos-workspace.dto';
import { PosWorkspaceActivationService } from './pos-workspace-activation.service';
import { PosPortalOnboardingService } from './pos-portal-onboarding.service';
import {
  PosPortalAccessDeniedResponseDto,
  PosPortalAuthResponseDto,
  PosPortalSessionResponseDto,
} from './dto/pos-portal-auth-response.dto';
import {
  PosWorkspaceActivationPaymentResponseDto,
  PosWorkspaceTrialActivationResponseDto,
  StartPosWorkspaceTrialDto,
  StartPosWorkspaceActivationDto,
} from './dto/start-pos-workspace-activation.dto';

type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: User;
  isNewUser?: boolean;
};

type PortalAuthSource = 'login' | 'google' | 'apple' | 'session';

const PORTAL_AUTH_WRITE_THROTTLE = { default: { ttl: 60_000, limit: 10 } };
const PORTAL_AUTH_SESSION_THROTTLE = { default: { ttl: 60_000, limit: 30 } };

@ApiTags('POS Portal Auth')
@Controller('pos-portal/auth')
export class PosPortalAuthController {
  private readonly logger = new Logger(PosPortalAuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly branchStaffService: BranchStaffService,
    private readonly posPortalOnboardingService: PosPortalOnboardingService,
    private readonly posWorkspaceActivationService: PosWorkspaceActivationService,
    private readonly auditService: AuditService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(PORTAL_AUTH_WRITE_THROTTLE)
  @ApiOperation({
    summary:
      'Authenticate the POS portal with email/password and resolve branch workspaces',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: PosPortalAuthResponseDto })
  @ApiForbiddenResponse({ type: PosPortalAccessDeniedResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or token data' })
  @ApiTooManyRequestsResponse({ description: 'Too many auth attempts' })
  async login(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest) {
    const result = await this.authService.login(dto);
    return this.buildAuthResponse(result, req, 'login');
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle(PORTAL_AUTH_WRITE_THROTTLE)
  @ApiOperation({
    summary:
      'Exchange a Google ID token for a POS portal session and branch workspaces',
  })
  @ApiBody({ type: GoogleAuthDto })
  @ApiOkResponse({ type: PosPortalAuthResponseDto })
  @ApiForbiddenResponse({ type: PosPortalAccessDeniedResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid Google token' })
  @ApiTooManyRequestsResponse({ description: 'Too many auth attempts' })
  async google(@Body() dto: GoogleAuthDto, @Req() req: AuthenticatedRequest) {
    const result = await this.authService.googleLogin(dto);
    return this.buildAuthResponse(result, req, 'google');
  }

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @Throttle(PORTAL_AUTH_WRITE_THROTTLE)
  @ApiOperation({
    summary:
      'Exchange an Apple identity token for a POS portal session and branch workspaces',
  })
  @ApiBody({ type: AppleAuthDto })
  @ApiOkResponse({ type: PosPortalAuthResponseDto })
  @ApiForbiddenResponse({ type: PosPortalAccessDeniedResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid Apple token' })
  @ApiTooManyRequestsResponse({ description: 'Too many auth attempts' })
  async apple(@Body() dto: AppleAuthDto, @Req() req: AuthenticatedRequest) {
    const result = await this.authService.appleLogin(dto);
    return this.buildAuthResponse(result, req, 'apple');
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  @Throttle(PORTAL_AUTH_SESSION_THROTTLE)
  @ApiOperation({
    summary:
      'Resolve the current POS portal session from an existing JWT and branch workspaces',
  })
  @ApiOkResponse({ type: PosPortalSessionResponseDto })
  @ApiForbiddenResponse({ type: PosPortalAccessDeniedResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiTooManyRequestsResponse({ description: 'Too many session lookups' })
  async session(@Req() req: AuthenticatedRequest) {
    const user = await this.authService.getUsersService().findById(req.user.id);
    const authenticatedUser =
      await this.authService.buildAuthenticatedUser(user);
    const bearerToken = this.extractBearerToken(req);

    let session;

    try {
      session = await this.buildPortalSession(user, req, 'session');
    } catch (error) {
      throw this.decoratePortalAccessError(error, bearerToken);
    }

    return {
      user: this.serializeUser(authenticatedUser),
      ...session,
    };
  }

  @Post('activation/ebirr')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle(PORTAL_AUTH_WRITE_THROTTLE)
  @ApiOperation({
    summary:
      'Initiate an Ebirr payment to activate a pending POS branch workspace',
  })
  @ApiBody({ type: StartPosWorkspaceActivationDto })
  @ApiOkResponse({ type: PosWorkspaceActivationPaymentResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async activateWorkspaceWithEbirr(
    @Body() dto: StartPosWorkspaceActivationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.posWorkspaceActivationService.startEbirrActivationPayment(
      {
        id: req.user.id,
        roles: req.user.roles,
      },
      dto,
    );
  }

  @Post('activation/trial')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle(PORTAL_AUTH_WRITE_THROTTLE)
  @ApiOperation({
    summary: 'Start a 15-day trial for an eligible POS branch workspace',
  })
  @ApiBody({ type: StartPosWorkspaceTrialDto })
  @ApiOkResponse({ type: PosWorkspaceTrialActivationResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async activateWorkspaceTrial(
    @Body() dto: StartPosWorkspaceTrialDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.posWorkspaceActivationService.startTrialActivation(
      {
        id: req.user.id,
        roles: req.user.roles,
      },
      dto,
    );
  }

  @Post('workspace')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @Throttle(PORTAL_AUTH_WRITE_THROTTLE)
  @ApiOperation({
    summary:
      'Create the first POS tenant and branch workspace for an authenticated user without POS access',
  })
  @ApiBody({ type: CreatePosWorkspaceDto })
  @ApiOkResponse({ type: CreatePosWorkspaceResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async createWorkspace(
    @Body() dto: CreatePosWorkspaceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = await this.authService.getUsersService().findById(req.user.id);

    return this.posPortalOnboardingService.createWorkspaceForUser(user, dto);
  }

  private async buildAuthResponse(
    result: AuthResult,
    req: AuthenticatedRequest,
    source: PortalAuthSource,
  ) {
    let session;

    try {
      session = await this.buildPortalSession(
        result.user,
        req,
        source,
        result.isNewUser ?? false,
      );
    } catch (error) {
      throw this.decoratePortalAccessError(error, result.accessToken);
    }

    if (source === 'google' || source === 'apple') {
      await this.recordPortalAuthEvent({
        action: `pos_portal.auth.${source}.success`,
        event: 'pos_portal_auth_success',
        level: 'log',
        req,
        user: result.user,
        meta: {
          source,
          branchCount: session.branches.length,
          defaultBranchId: session.defaultBranchId,
          requiresBranchSelection: session.requiresBranchSelection,
        },
      });
    }

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: this.serializeUser(result.user),
      ...session,
    };
  }

  private async buildPortalSession(
    user: User,
    req: AuthenticatedRequest,
    source: PortalAuthSource,
    isNewUser = false,
  ) {
    const branches = await this.branchStaffService.getPosBranchSummariesForUser(
      {
        id: user.id,
        roles: user.roles,
      },
    );

    if (!branches.length) {
      const activationCandidates =
        await this.branchStaffService.getPosWorkspaceActivationCandidatesForUser(
          {
            id: user.id,
            roles: user.roles,
          },
        );

      if (activationCandidates.length) {
        const pricing = this.branchStaffService.getPosWorkspacePricing();

        await this.recordPortalAuthEvent({
          action: 'pos_portal.auth.activation_required',
          event: 'pos_portal_auth_activation_required',
          level: 'warn',
          req,
          user,
          meta: {
            source,
            branchCount: 0,
            activationCandidateCount: activationCandidates.length,
          },
        });

        throw new ForbiddenException({
          code: 'POS_PORTAL_ACTIVATION_REQUIRED',
          message:
            'Your account is linked to branch workspaces, but POS-S activation is still required before you can open them.',
          onboardingState: 'BRANCH_WORKSPACE_ACTIVATION_REQUIRED',
          pricing,
          activationCandidates,
          details: {
            pricing,
            activationCandidates,
            onboardingState: 'BRANCH_WORKSPACE_ACTIVATION_REQUIRED',
          },
        });
      }

      await this.recordPortalAuthEvent({
        action: 'pos_portal.auth.access_denied',
        event: 'pos_portal_auth_access_denied',
        level: 'warn',
        req,
        user,
        meta: {
          source,
          branchCount: 0,
          accountCreated: isNewUser,
        },
      });

      throw new ForbiddenException({
        code: 'POS_PORTAL_ACCESS_DENIED',
        message:
          source === 'google' && isNewUser
            ? 'Your Google account was created successfully, but it is not linked to any active POS branch workspace yet.'
            : 'This account is not linked to any active POS branch workspace.',
        accountCreated: source === 'google' && isNewUser,
        onboardingState:
          source === 'google' && isNewUser
            ? 'ACCOUNT_CREATED_BRANCH_LINK_REQUIRED'
            : undefined,
        details: {
          accountCreated: source === 'google' && isNewUser,
          onboardingState:
            source === 'google' && isNewUser
              ? 'ACCOUNT_CREATED_BRANCH_LINK_REQUIRED'
              : undefined,
        },
      });
    }

    return {
      branches,
      defaultBranchId: branches.length === 1 ? branches[0].branchId : null,
      requiresBranchSelection: branches.length > 1,
      portalKey: 'pos',
    };
  }

  private serializeUser(user: User) {
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  private async recordPortalAuthEvent(params: {
    action: string;
    event: string;
    level: 'log' | 'warn';
    req: AuthenticatedRequest;
    user: User;
    meta?: Record<string, unknown>;
  }) {
    const requestMeta = {
      sourceIp: this.resolveSourceIp(params.req),
      userAgent: this.resolveUserAgent(params.req),
      path: params.req?.route?.path ?? params.req?.url ?? null,
      method: params.req?.method ?? null,
    };
    const payload = {
      event: params.event,
      action: params.action,
      userId: params.user.id,
      email: params.user.email,
      ...requestMeta,
      ...(params.meta ?? {}),
    };

    this.logger[params.level](JSON.stringify(payload));

    try {
      await this.auditService.log({
        action: params.action,
        targetType: 'USER',
        targetId: params.user.id,
        actorId: params.user.id,
        actorEmail: params.user.email,
        meta: {
          ...requestMeta,
          ...(params.meta ?? {}),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown audit log failure';
      this.logger.warn(
        `Failed to persist POS portal auth audit action=${params.action} userId=${params.user.id}: ${message}`,
      );
    }
  }

  private resolveSourceIp(req: AuthenticatedRequest): string | null {
    const forwarded = req?.headers?.['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.split(',')[0].trim();
    }
    return req?.ip ?? null;
  }

  private resolveUserAgent(req: AuthenticatedRequest): string | null {
    const raw = req?.headers?.['user-agent'];
    if (Array.isArray(raw)) return raw[0] ?? null;
    return typeof raw === 'string' && raw.trim() ? raw : null;
  }

  private decoratePortalAccessError(
    error: unknown,
    accessToken?: string | null,
  ) {
    const response =
      error instanceof ForbiddenException ? error.getResponse() : null;
    const token = String(accessToken || '').trim();

    if (
      response &&
      typeof response === 'object' &&
      (response as any).code === 'POS_PORTAL_ACTIVATION_REQUIRED'
    ) {
      return new ForbiddenException({
        ...(response as Record<string, unknown>),
        activationAccessToken: token || undefined,
        details: {
          ...(((response as any).details as Record<string, unknown>) || {}),
          activationAccessToken: token || undefined,
        },
      });
    }

    if (
      response &&
      typeof response === 'object' &&
      (response as any).code === 'POS_PORTAL_ACCESS_DENIED'
    ) {
      return new ForbiddenException({
        ...(response as Record<string, unknown>),
        onboardingAccessToken: token || undefined,
        details: {
          ...(((response as any).details as Record<string, unknown>) || {}),
          onboardingAccessToken: token || undefined,
        },
      });
    }

    return error;
  }

  private extractBearerToken(req: AuthenticatedRequest): string {
    const raw = req?.headers?.authorization;
    const header = Array.isArray(raw) ? raw[0] : raw;

    if (typeof header !== 'string') {
      return '';
    }

    const match = header.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || '';
  }
}
