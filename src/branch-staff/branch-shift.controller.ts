import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { BranchShiftService } from './branch-shift.service';
import {
  AssignShiftStaffDto,
  CreateBranchShiftDto,
  UpdateBranchShiftDto,
} from './dto/branch-shift.dto';

function serializeShift(shift: any) {
  return {
    id: shift.id,
    branchId: shift.branchId,
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    daysOfWeek: Array.isArray(shift.daysOfWeek)
      ? shift.daysOfWeek.map((d: string) => Number(d))
      : [],
    isActive: shift.isActive,
    staff: Array.isArray(shift.staffAssignments)
      ? shift.staffAssignments.map((sa: any) => ({
          userId: sa.userId,
          displayName: sa.user?.displayName ?? null,
          username: sa.user?.posUsername ?? null,
        }))
      : [],
    createdAt: shift.createdAt,
    updatedAt: shift.updatedAt,
  };
}

@ApiTags('POS Branch Shifts')
@Controller('pos/v1/branches/:branchId/shifts')
@UseGuards(JwtAuthGuard)
export class BranchShiftController {
  constructor(private readonly branchShiftService: BranchShiftService) {}

  @Get()
  async findByBranch(@Param('branchId', ParseIntPipe) branchId: number) {
    const shifts = await this.branchShiftService.findByBranch(branchId);
    return shifts.map(serializeShift);
  }

  @Post()
  async create(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: CreateBranchShiftDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const shift = await this.branchShiftService.create(branchId, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
    return serializeShift(shift);
  }

  @Patch(':shiftId')
  async update(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('shiftId', ParseIntPipe) shiftId: number,
    @Body() dto: UpdateBranchShiftDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const shift = await this.branchShiftService.update(branchId, shiftId, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
    return serializeShift(shift);
  }

  @Delete(':shiftId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('shiftId', ParseIntPipe) shiftId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.branchShiftService.remove(branchId, shiftId, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Post(':shiftId/staff')
  async assignStaff(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('shiftId', ParseIntPipe) shiftId: number,
    @Body() dto: AssignShiftStaffDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.branchShiftService.assignStaff(branchId, shiftId, dto.userId, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
    return { ok: true };
  }

  @Delete(':shiftId/staff/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStaff(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('shiftId', ParseIntPipe) shiftId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.branchShiftService.removeStaff(branchId, shiftId, userId, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @ApiOkResponse({
    description: 'Shifts assigned to a specific staff member on this branch.',
  })
  @Get('staff/:userId')
  async getShiftsForStaff(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    const shifts = await this.branchShiftService.getShiftsForStaff(
      branchId,
      userId,
    );
    return shifts.map((s) => serializeShift(s));
  }
}
