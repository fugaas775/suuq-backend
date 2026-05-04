import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { BranchStaffAssignmentResponseDto } from './dto/branch-staff-response.dto';
import { CreateBranchStaffManualAccountDto } from './dto/create-branch-staff-manual-account.dto';
import { UpdateBranchStaffAssignmentDto } from './dto/update-branch-staff-assignment.dto';
import { BranchStaffAssignment } from './entities/branch-staff-assignment.entity';
import { BranchStaffCapability } from './entities/branch-staff-assignment.entity';
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
        ? assignment.capabilities.filter(
            (capability): capability is BranchStaffCapability =>
              Object.values(BranchStaffCapability).includes(
                capability as BranchStaffCapability,
              ),
          )
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
}
