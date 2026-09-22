import { Injectable, Logger, Optional } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectDataSource } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';

const up = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase();

/**
 * Whether a token's roles still carry the ADMIN that used to be DERIVED from
 * VENDOR at sign-in. EffectiveUserRoleService no longer derives it, but an
 * access token minted before that change keeps it until it expires — and
 * ADMIN in a token opened every platform-admin route and skipped the branch
 * membership check on every POS route. A token is only asked about when it
 * carries VENDOR and ADMIN without SUPER_ADMIN, which is exactly the derived
 * shape; a real admin's ADMIN is stored on the user row and survives.
 */
export function carriesPossiblyDerivedAdmin(roles: unknown): boolean {
  if (!Array.isArray(roles)) return false;
  const set = new Set(roles.map(up));
  return set.has('ADMIN') && set.has('VENDOR') && !set.has('SUPER_ADMIN');
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  /** user id → { stored ADMIN?, when read }. Few accounts ever reach it. */
  private readonly storedAdmin = new Map<
    number,
    { admin: boolean; at: number }
  >();

  constructor(
    private configService: ConfigService,
    @Optional()
    @InjectDataSource()
    private readonly dataSource?: DataSource,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  // This method is called by passport after it verifies the token's signature.
  // It decodes the payload and returns it. NestJS then automatically
  // attaches this returned object to the `request.user` property.
  async validate(payload: any) {
    return {
      id: payload.sub,
      email: payload.email,
      roles: await this.trustedRoles(payload),
      tokenType: payload.tokenType,
      branchId: payload.branchId,
      branchRole: payload.branchRole,
      permissions: payload.permissions,
      assignedSurfaces: payload.assignedSurfaces,
      capabilities: payload.capabilities,
      isOwner: payload.isOwner,
      isTenantOwner: payload.isTenantOwner,
      approvalType: payload.approvalType,
    };
  }

  /**
   * The token's roles, less an ADMIN the user row does not hold. Fails
   * CLOSED: if the row cannot be read, a vendor token loses ADMIN for this
   * request rather than keeping platform access on a database hiccup.
   */
  private async trustedRoles(payload: any): Promise<unknown> {
    const roles = payload?.roles;
    if (!carriesPossiblyDerivedAdmin(roles)) return roles;
    const withoutAdmin = (roles as unknown[]).filter((r) => up(r) !== 'ADMIN');
    const userId = Number(payload?.sub);
    if (!Number.isFinite(userId) || userId <= 0 || !this.dataSource) {
      return withoutAdmin;
    }
    const cached = this.storedAdmin.get(userId);
    if (cached && Date.now() - cached.at < 5 * 60_000) {
      return cached.admin ? roles : withoutAdmin;
    }
    try {
      const row = await this.dataSource.getRepository(User).findOne({
        where: { id: userId },
        select: { id: true, roles: true },
      });
      const admin = (row?.roles ?? []).map(up).includes('ADMIN');
      this.storedAdmin.set(userId, { admin, at: Date.now() });
      return admin ? roles : withoutAdmin;
    } catch (err) {
      this.logger.warn(
        `Could not confirm stored roles for user ${userId}: ${(err as Error)?.message}`,
      );
      return withoutAdmin;
    }
  }
}
