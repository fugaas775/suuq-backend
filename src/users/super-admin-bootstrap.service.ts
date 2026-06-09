import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserRole } from '../auth/roles.enum';

/**
 * On application start, ensures every email listed in the `SUPER_ADMIN_EMAILS`
 * env var (comma-separated) is elevated to SUPER_ADMIN (+ ADMIN). This gives a
 * durable, code-reviewed, deploy-time mechanism for granting platform
 * super-admin access without a manual production database edit.
 *
 * Idempotent: users already holding SUPER_ADMIN are skipped. Emails with no
 * matching user yet are logged as a warning (not an error) so the boot
 * continues — they will be elevated on the next boot once the account exists.
 *
 * NOTE: roles are read from the JWT payload at request time
 * (auth/jwt.strategy.ts), so a freshly-elevated user must re-login before the
 * SUPER_ADMIN role takes effect on their requests.
 */
@Injectable()
export class SuperAdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SuperAdminBootstrapService.name);

  constructor(private readonly usersService: UsersService) {}

  async onModuleInit(): Promise<void> {
    const raw = process.env.SUPER_ADMIN_EMAILS;
    if (!raw || !raw.trim()) {
      return;
    }

    const emails = raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    for (const email of emails) {
      try {
        const user = await this.usersService.findByEmail(email);
        if (!user) {
          this.logger.warn(
            `SUPER_ADMIN_EMAILS: no user found for "${email}" yet — skipping (will retry next boot).`,
          );
          continue;
        }

        if (user.roles?.includes(UserRole.SUPER_ADMIN)) {
          continue;
        }

        const nextRoles = Array.from(
          new Set([
            ...(user.roles ?? []),
            UserRole.SUPER_ADMIN,
            UserRole.ADMIN,
          ]),
        );
        const updated = await this.usersService.updateUserRoles(
          user.id,
          nextRoles,
        );
        this.logger.log(
          `Elevated "${email}" (User #${user.id}) to SUPER_ADMIN. Roles: ${updated.roles.join(', ')}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to elevate "${email}" to SUPER_ADMIN: ${(err as Error)?.message}`,
        );
      }
    }
  }
}
