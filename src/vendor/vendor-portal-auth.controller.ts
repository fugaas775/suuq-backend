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
import { VendorStaffService } from './vendor-staff.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import {
  VendorPortalAccessDeniedResponseDto,
  VendorPortalAuthResponseDto,
  VendorPortalSessionResponseDto,
} from './dto/vendor-portal-auth-response.dto';

type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

type PortalAuthSource = 'login' | 'google' | 'apple' | 'session';

const PORTAL_AUTH_WRITE_THROTTLE = { default: { ttl: 60_000, limit: 10 } };
const PORTAL_AUTH_SESSION_THROTTLE = { default: { ttl: 60_000, limit: 30 } };

@ApiTags('Vendor Portal Auth')
@Controller('vendor-portal/auth')
export class VendorPortalAuthController {
  private readonly logger = new Logger(VendorPortalAuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly vendorStaffService: VendorStaffService,
    private readonly auditService: AuditService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(PORTAL_AUTH_WRITE_THROTTLE)
  @ApiOperation({
    summary:
      'Authenticate the vendor portal with email/password and resolve store memberships',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: VendorPortalAuthResponseDto })
  @ApiForbiddenResponse({ type: VendorPortalAccessDeniedResponseDto })
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
      'Exchange a Google ID token for a vendor portal session and store memberships',
  })
  @ApiBody({ type: GoogleAuthDto })
  @ApiOkResponse({ type: VendorPortalAuthResponseDto })
  @ApiForbiddenResponse({ type: VendorPortalAccessDeniedResponseDto })
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
      'Exchange an Apple identity token for a vendor portal session and store memberships',
  })
  @ApiBody({ type: AppleAuthDto })
  @ApiOkResponse({ type: VendorPortalAuthResponseDto })
  @ApiForbiddenResponse({ type: VendorPortalAccessDeniedResponseDto })
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
      'Resolve the current vendor portal session from an existing JWT and store memberships',
  })
  @ApiOkResponse({ type: VendorPortalSessionResponseDto })
  @ApiForbiddenResponse({ type: VendorPortalAccessDeniedResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiTooManyRequestsResponse({ description: 'Too many session lookups' })
  async session(@Req() req: AuthenticatedRequest) {
    const user = await this.authService
      .getUsersService()
      .findById(req.user.id, ['employments']);
    const authenticatedUser =
      await this.authService.buildAuthenticatedUser(user);
    const session = await this.buildPortalSession(user, req, 'session');

    return {
      user: this.serializeUser(authenticatedUser),
      ...session,
    };
  }

  private async buildAuthResponse(
    result: AuthResult,
    req: AuthenticatedRequest,
    source: PortalAuthSource,
  ) {
    const session = await this.buildPortalSession(result.user, req, source);

    if (source === 'google' || source === 'apple') {
      await this.recordPortalAuthEvent({
        action: `vendor_portal.auth.${source}.success`,
        event: 'vendor_portal_auth_success',
        level: 'log',
        req,
        user: result.user,
        meta: {
          source,
          storeCount: session.stores.length,
          defaultVendorId: session.defaultVendorId,
          requiresStoreSelection: session.requiresStoreSelection,
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
  ) {
    const stores = await this.vendorStaffService.getStoreSummariesForUser({
      id: user.id,
      roles: user.roles,
    });

    if (!stores.length) {
      await this.recordPortalAuthEvent({
        action: 'vendor_portal.auth.access_denied',
        event: 'vendor_portal_auth_access_denied',
        level: 'warn',
        req,
        user,
        meta: {
          source,
          storeCount: 0,
        },
      });

      throw new ForbiddenException({
        code: 'VENDOR_PORTAL_ACCESS_DENIED',
        message:
          'This account is not linked to any vendor store or staff workspace.',
      });
    }

    return {
      stores,
      defaultVendorId: stores.length === 1 ? stores[0].vendorId : null,
      requiresStoreSelection: stores.length > 1,
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
        `Failed to persist vendor portal auth audit action=${params.action} userId=${params.user.id}: ${message}`,
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
}
