import {
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { BranchStaffService } from './branch-staff.service';

/**
 * BranchSecurityController
 *
 * IMPORTANT: This controller uses @Controller('pos/v1/branches/:branchId') — a
 * different base path from BranchStaffController ('pos/v1/branches/:branchId/staff').
 *
 * NestJS/Express does NOT resolve '../' in route decorators. A route like
 * @Delete('../operator-sessions') under the /staff controller registers the
 * literal path '.../staff/../operator-sessions', which Express never normalises
 * and will never match. Both controllers must be declared in the module.
 */
@ApiTags('POS Branch Security')
@Controller('pos/v1/branches/:branchId')
@UseGuards(JwtAuthGuard)
export class BranchSecurityController {
  constructor(private readonly branchStaffService: BranchStaffService) {}

  /**
   * DELETE /api/pos/v1/branches/:branchId/operator-sessions
   *
   * Revokes ALL active operator sessions branch-wide.
   * Records operatorSessionsRevokedAt = NOW() in pos_branch_security.
   * Any pos_operator JWT with iat before that timestamp is rejected by
   * PosBranchAccessGuard on the next API call, forcing gate-screen re-login.
   *
   * Optional query param: ?userId=<id>
   * When present, revokes only that user's manager session via
   * BranchStaffAssignment.sessionRevokedAt instead of the branch-wide timestamp.
   *
   * Authorization: branch manager, owner, or MANAGE_BRANCH_STAFF capability.
   */
  @ApiOperation({ summary: 'Revoke operator sessions for a branch' })
  @ApiOkResponse({ description: 'Sessions revoked successfully.' })
  @ApiForbiddenResponse({
    description: 'Not authorized to manage this branch.',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired portal token.' })
  @Delete('operator-sessions')
  async revokeOperatorSessions(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('userId') userId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const actor = { id: req.user?.id ?? null, email: req.user?.email ?? null };

    if (userId !== undefined) {
      const resolvedUserId = parseInt(userId, 10);
      if (isNaN(resolvedUserId) || resolvedUserId <= 0) {
        return {
          status: 'ERROR',
          message: 'userId query param must be a positive integer.',
        };
      }
      return this.branchStaffService.revokeManagerSession(
        branchId,
        resolvedUserId,
        actor,
      );
    }

    return this.branchStaffService.revokeAllOperatorSessions(branchId, actor);
  }
}
