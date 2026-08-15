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
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RequirePosPermissions } from '../auth/decorators/require-pos-permissions.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { PosSchoolPermission } from './permissions/pos-school-permission.enum';
import {
  CreateSchoolClassDto,
  ListSchoolClassesQueryDto,
  ReorderSchoolClassesDto,
  UpdateSchoolClassDto,
} from './dto/school-class.dto';
import { SchoolClassService } from './school-class.service';

const GUARDS = [
  JwtAuthGuard,
  RolesGuard,
  RetailModulesGuard,
  PosBranchAccessGuard,
];
const ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
];

/**
 * The class registry, under the format's own route namespace — the same shape
 * PROPERTY_RENTAL's inventory controller has, for the same reason: a format owns
 * its units.
 *
 * Writes are gated on ENROL_STUDENT rather than a new MANAGE_CLASSES permission.
 * Whoever may put a child into a class may define the classes; adding a
 * permission would mean touching the load-bearing allow-list in
 * `create-branch-staff-manual-account.dto.ts`, the frontend constant and the
 * staff-permission UI, for a distinction no school has asked to draw.
 */
@ApiTags('School Classes')
@Controller('pos/v1/school')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolClassController {
  constructor(private readonly svc: SchoolClassService) {}

  @Get('classes')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.VIEW_CLASS_BOARD)
  list(@Query() query: ListSchoolClassesQueryDto) {
    return this.svc.list(query);
  }

  @Post('classes')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  create(@Body() dto: CreateSchoolClassDto) {
    return this.svc.create(dto);
  }

  @Patch('classes/reorder')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  reorder(@Body() dto: ReorderSchoolClassesDto) {
    return this.svc.reorder(dto);
  }

  // Declared AFTER 'classes/reorder' so the literal route is matched first —
  // ':id' would otherwise swallow it and ParseIntPipe would 400 on "reorder".
  @Patch('classes/:id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchoolClassDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete('classes/:id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.svc.remove(id, branchId);
  }
}
