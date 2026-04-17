import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AssignBranchStaffDto } from './dto/assign-branch-staff.dto';
import {
  BranchStaffAssignmentResponseDto,
  BranchStaffInviteActionResponseDto,
  BranchStaffInviteResponseDto,
  InviteBranchStaffResponseDto,
} from './dto/branch-staff-response.dto';
import { InviteBranchStaffDto } from './dto/invite-branch-staff.dto';
import { BranchStaffAssignment } from './entities/branch-staff-assignment.entity';
import { BranchStaffInvite } from './entities/branch-staff-invite.entity';
import { BranchStaffService } from './branch-staff.service';

@ApiTags('POS Branch Staff')
@Controller('pos/v1/branches/:branchId/staff')
@UseGuards(JwtAuthGuard)
export class BranchStaffController {
  constructor(private readonly branchStaffService: BranchStaffService) {}

  private serializeAssignment(
    assignment: BranchStaffAssignment | null | undefined,
  ): BranchStaffAssignmentResponseDto | null {
    if (!assignment) {
      return null;
    }

    return {
      id: assignment.id,
      branchId: assignment.branchId,
      userId: assignment.userId,
      role: assignment.role,
      permissions: Array.isArray(assignment.permissions)
        ? assignment.permissions
        : [],
      isActive: assignment.isActive,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      user: assignment.user
        ? {
            id: assignment.user.id,
            email: assignment.user.email,
            displayName: assignment.user.displayName ?? null,
          }
        : null,
    };
  }

  private serializeInvite(
    invite: BranchStaffInvite,
  ): BranchStaffInviteResponseDto {
    return {
      id: invite.id,
      branchId: invite.branchId,
      email: invite.email,
      role: invite.role,
      permissions: Array.isArray(invite.permissions) ? invite.permissions : [],
      invitedByUserId: invite.invitedByUserId ?? null,
      acceptedByUserId: invite.acceptedByUserId ?? null,
      isActive: invite.isActive,
      acceptedAt: invite.acceptedAt ?? null,
      createdAt: invite.createdAt,
      updatedAt: invite.updatedAt,
    };
  }

  @ApiOkResponse({ type: BranchStaffAssignmentResponseDto, isArray: true })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Get()
  async findByBranch(
    @Param('branchId') branchId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const resolvedBranchId = Number(branchId);
    await this.branchStaffService.assertCanManageBranchStaff(
      req.user,
      resolvedBranchId,
    );

    const assignments =
      await this.branchStaffService.findByBranch(resolvedBranchId);
    return assignments.map((assignment) =>
      this.serializeAssignment(assignment),
    );
  }

  @ApiOkResponse({ type: BranchStaffInviteResponseDto, isArray: true })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Get('invites')
  async findPendingInvites(
    @Param('branchId') branchId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const resolvedBranchId = Number(branchId);
    await this.branchStaffService.assertCanManageBranchStaff(
      req.user,
      resolvedBranchId,
    );

    const invites =
      await this.branchStaffService.findPendingInvitesByBranch(
        resolvedBranchId,
      );
    return invites.map((invite) => this.serializeInvite(invite));
  }

  @ApiCreatedResponse({ type: BranchStaffAssignmentResponseDto })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Post()
  async assign(
    @Param('branchId') branchId: string,
    @Body() dto: AssignBranchStaffDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const resolvedBranchId = Number(branchId);
    await this.branchStaffService.assertCanManageBranchStaff(
      req.user,
      resolvedBranchId,
    );

    const assignment = await this.branchStaffService.assign(
      resolvedBranchId,
      dto,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
      },
    );
    return this.serializeAssignment(assignment);
  }

  @ApiOkResponse({ type: BranchStaffAssignmentResponseDto })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Delete(':userId')
  async unassign(
    @Param('branchId') branchId: string,
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const resolvedBranchId = Number(branchId);
    await this.branchStaffService.assertCanManageBranchStaff(
      req.user,
      resolvedBranchId,
    );

    const assignment = await this.branchStaffService.unassign(
      resolvedBranchId,
      Number(userId),
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
      },
    );

    return this.serializeAssignment(assignment);
  }

  @ApiCreatedResponse({ type: InviteBranchStaffResponseDto })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Post('invite')
  async invite(
    @Param('branchId') branchId: string,
    @Body() dto: InviteBranchStaffDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const resolvedBranchId = Number(branchId);
    await this.branchStaffService.assertCanManageBranchStaff(
      req.user,
      resolvedBranchId,
    );

    const result = await this.branchStaffService.invite(
      resolvedBranchId,
      dto,
      req.user?.id ?? null,
    );

    return {
      status: result.status,
      invite: this.serializeInvite(result.invite),
      assignment: this.serializeAssignment(result.assignment),
    };
  }

  @ApiCreatedResponse({ type: BranchStaffInviteActionResponseDto })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Post('invites/:inviteId/resend')
  async resendInvite(
    @Param('branchId') branchId: string,
    @Param('inviteId') inviteId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const resolvedBranchId = Number(branchId);
    await this.branchStaffService.assertCanManageBranchStaff(
      req.user,
      resolvedBranchId,
    );

    const result = await this.branchStaffService.resendInvite(
      resolvedBranchId,
      Number(inviteId),
    );

    return {
      status: result.status,
      invite: this.serializeInvite(result.invite),
    };
  }

  @ApiCreatedResponse({ type: BranchStaffInviteActionResponseDto })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Post('invites/:inviteId/revoke')
  async revokeInvite(
    @Param('branchId') branchId: string,
    @Param('inviteId') inviteId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const resolvedBranchId = Number(branchId);
    await this.branchStaffService.assertCanManageBranchStaff(
      req.user,
      resolvedBranchId,
    );

    const result = await this.branchStaffService.revokeInvite(
      resolvedBranchId,
      Number(inviteId),
    );

    return {
      status: result.status,
      invite: this.serializeInvite(result.invite),
    };
  }
}
