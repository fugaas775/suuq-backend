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
import {
  CreateBranchEmployeeDto,
  CreatePayrollRunDto,
  ListBranchEmployeesQueryDto,
  ListPayrollRunsQueryDto,
  UpdateBranchEmployeeDto,
} from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

const GUARDS = [
  JwtAuthGuard,
  RolesGuard,
  RetailModulesGuard,
  PosBranchAccessGuard,
];

/**
 * Employees and payroll, for any branch format.
 *
 * POS_OPERATOR is deliberately absent from the role list every other
 * `pos/v1/*` controller grants it. Salaries are the one branch record where the
 * person keying sales must not be able to read the row — a cashier looking up
 * the director's pay is a different kind of incident from a cashier voiding a
 * sale, and no per-permission checkbox makes it safe enough to offer. The scoped
 * POS token issues POS_MANAGER to owners and managers and POS_OPERATOR to
 * everyone else, so the role gate is exactly the line the school wanted.
 */
@ApiTags('Payroll')
@Controller('pos/v1/payroll')
@UseGuards(...GUARDS)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  @Get('employees')
  @RetailBranchContext('query.branchId')
  listEmployees(@Query() query: ListBranchEmployeesQueryDto) {
    return this.svc.listEmployees(query);
  }

  @Post('employees')
  @RetailBranchContext('body.branchId')
  createEmployee(@Body() dto: CreateBranchEmployeeDto) {
    return this.svc.createEmployee(dto);
  }

  @Patch('employees/:id')
  @RetailBranchContext('body.branchId')
  updateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBranchEmployeeDto,
  ) {
    return this.svc.updateEmployee(id, dto);
  }

  @Delete('employees/:id')
  @RetailBranchContext('query.branchId')
  removeEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.svc.removeEmployee(id, branchId);
  }

  @Get('runs')
  @RetailBranchContext('query.branchId')
  listRuns(@Query() query: ListPayrollRunsQueryDto) {
    return this.svc.listRuns(query);
  }

  @Post('runs')
  @RetailBranchContext('body.branchId')
  createRun(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePayrollRunDto,
  ) {
    const userId = Number((req.user as { id?: number })?.id) || 0;
    return this.svc.createRun(dto.branchId, userId, dto);
  }

  @Delete('runs/:id')
  @RetailBranchContext('query.branchId')
  deleteRun(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.svc.deleteRun(id, branchId);
  }
}
