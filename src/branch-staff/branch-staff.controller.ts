import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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
import { BranchStaffAssignmentResponseDto } from './dto/branch-staff-response.dto';
import {
  BranchStaffInviteActionResponseDto,
  BranchStaffInviteResponseDto,
  InviteBranchStaffResponseDto,
} from './dto/branch-staff-response.dto';
import { ChangeStaffPasswordDto } from './dto/change-staff-password.dto';
import { CreateBranchStaffManualAccountDto } from './dto/create-branch-staff-manual-account.dto';
import { InviteBranchStaffDto } from './dto/invite-branch-staff.dto';
import { UpdateBranchStaffAssignmentDto } from './dto/update-branch-staff-assignment.dto';
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
      assignedSurfaces: assignment.assignedSurfaces ?? null,
      capabilities: Array.isArray(assignment.capabilities)
        ? assignment.capabilities
        : [],
      posExperienceProfileCode: assignment.posExperienceProfileCode ?? null,
      serviceSharePct: assignment.serviceSharePct ?? null,
      isActive: assignment.isActive,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      user: assignment.user
        ? {
            id: assignment.user.id,
            email: assignment.user.email,
            displayName: assignment.user.displayName ?? null,
            username: assignment.user.posUsername ?? null,
            authMode: assignment.user.authMode ?? null,
          }
        : null,
    };
  }

  private serializeInvite(
    invite: BranchStaffInvite | null | undefined,
  ): BranchStaffInviteResponseDto | null {
    if (!invite) {
      return null;
    }

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

  /** Lightweight staff roster accessible by any active branch member.
   * Pass ?profiles=QSR_WAITER,BARBER_COUNTER etc. to filter by lane profile.
   * Defaults to BARBER_COUNTER,SALON_STYLIST when no profiles param is given.
   */
  @Get('roster')
  async getStylistRoster(
    @Param('branchId') branchId: string,
    @Query('profiles') profilesParam: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const resolvedBranchId = Number(branchId);
    await this.branchStaffService.assertIsBranchMember(
      req.user,
      resolvedBranchId,
    );
    const profiles = profilesParam
      ? profilesParam
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
      : ['BARBER_COUNTER', 'SALON_STYLIST'];
    return this.branchStaffService.findStylistRoster(
      resolvedBranchId,
      profiles,
    );
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

  @ApiCreatedResponse({ type: InviteBranchStaffResponseDto })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Post('invite')
  async invite(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: InviteBranchStaffDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.branchStaffService.assertCanManageBranchStaff(
      req.user,
      branchId,
    );
    const result = await this.branchStaffService.invite(branchId, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });

    return {
      status: result.status,
      invite: this.serializeInvite(result.invite),
      assignment: this.serializeAssignment(result.assignment),
    };
  }

  @ApiOkResponse({ type: BranchStaffInviteResponseDto, isArray: true })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Get('invites')
  async findInvites(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.branchStaffService.assertCanManageBranchStaff(
      req.user,
      branchId,
    );
    const invites = await this.branchStaffService.findInvitesByBranch(branchId);
    return invites.map((invite) => this.serializeInvite(invite));
  }

  @ApiCreatedResponse({ type: BranchStaffInviteActionResponseDto })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Post('invites/:inviteId/resend')
  async resendInvite(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('inviteId', ParseIntPipe) inviteId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.branchStaffService.assertCanManageBranchStaff(
      req.user,
      branchId,
    );
    const result = await this.branchStaffService.resendInvite(
      branchId,
      inviteId,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
      },
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
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('inviteId', ParseIntPipe) inviteId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.branchStaffService.assertCanManageBranchStaff(
      req.user,
      branchId,
    );
    const result = await this.branchStaffService.revokeInvite(
      branchId,
      inviteId,
    );

    return {
      status: result.status,
      invite: this.serializeInvite(result.invite),
    };
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

  @ApiCreatedResponse({ description: 'Manual staff account created.' })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Post('manual-account')
  async createManualAccount(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: CreateBranchStaffManualAccountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.branchStaffService.createManualAccount(branchId, dto, req.user);
  }

  @ApiOkResponse({ type: BranchStaffAssignmentResponseDto })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Patch(':userId')
  async updateAssignment(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateBranchStaffAssignmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const assignment = await this.branchStaffService.updateAssignment(
      branchId,
      userId,
      dto,
      req.user,
    );
    return this.serializeAssignment(assignment);
  }

  @ApiOkResponse({ description: 'Manual staff account deleted.' })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Delete(':userId/account')
  async deleteAccount(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.branchStaffService.deleteStaffAccount(
      branchId,
      userId,
      req.user,
    );
  }

  @ApiOkResponse({ description: 'Staff password updated.' })
  @ApiForbiddenResponse({
    description: 'Branch staff management access was denied.',
  })
  @Post(':userId/change-password')
  async changePassword(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ChangeStaffPasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.branchStaffService.changeStaffPassword(
      branchId,
      userId,
      dto.newPassword,
      req.user,
    );
  }
}
