import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { AttendanceSubjectType } from './entities/attendance-mark.entity';
import {
  ListAttendanceQueryDto,
  MarkAttendanceDto,
} from './dto/attendance.dto';
import { AttendanceService } from './attendance.service';

const GUARDS = [
  JwtAuthGuard,
  RolesGuard,
  RetailModulesGuard,
  PosBranchAccessGuard,
];

/**
 * The staff register — the same table, a narrower door.
 *
 * POS_OPERATOR is deliberately absent, for exactly the reason it is absent from
 * PayrollController: who came in late is an employment record about a colleague,
 * and a cashier reading the director's is a different kind of incident from a
 * cashier voiding a sale. The scoped POS token issues POS_MANAGER to owners and
 * managers, so the role gate is the line wanted and no permission checkbox can
 * widen it.
 *
 * There is no `reclass` here: staff have no class, and the column is null on
 * every row this controller writes.
 */
@ApiTags('Attendance')
@Controller('pos/v1/attendance')
@UseGuards(...GUARDS)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class AttendanceStaffController {
  constructor(private readonly svc: AttendanceService) {}

  @Get('staff')
  @RetailBranchContext('query.branchId')
  list(@Query() query: ListAttendanceQueryDto) {
    return this.svc.list(AttendanceSubjectType.STAFF, query);
  }

  @Get('staff/summary')
  @RetailBranchContext('query.branchId')
  summary(@Query() query: ListAttendanceQueryDto) {
    return this.svc.summary(AttendanceSubjectType.STAFF, query);
  }

  @Post('staff/mark')
  @RetailBranchContext('body.branchId')
  mark(@Body() dto: MarkAttendanceDto, @Req() req: AuthenticatedRequest) {
    return this.svc.mark(
      AttendanceSubjectType.STAFF,
      dto,
      req?.user?.id ?? null,
    );
  }
}
