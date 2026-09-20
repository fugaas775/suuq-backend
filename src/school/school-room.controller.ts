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
  CreateSchoolRoomDto,
  DeleteSchoolRoomQueryDto,
  ListSchoolRoomsQueryDto,
  UpdateSchoolRoomDto,
} from './dto/school-room.dto';
import { SchoolRoomService } from './school-room.service';

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

/** Rooms and desks. Read with the board; written with the registry (ENROL_STUDENT). */
@ApiTags('School Rooms')
@Controller('pos/v1/school/rooms')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolRoomController {
  constructor(private readonly svc: SchoolRoomService) {}

  @Get()
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.VIEW_CLASS_BOARD)
  list(@Query() query: ListSchoolRoomsQueryDto) {
    return this.svc.list(query.branchId);
  }

  @Post()
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  create(@Body() dto: CreateSchoolRoomDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchoolRoomDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: DeleteSchoolRoomQueryDto,
  ) {
    return this.svc.remove(id, query.branchId);
  }
}
