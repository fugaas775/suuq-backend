import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
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
import { PosSchoolPermission } from '../school/permissions/pos-school-permission.enum';
import {
  ListSchoolMessageThreadsQueryDto,
  OpenSchoolMessageThreadDto,
  ReplySchoolMessageDto,
} from './dto/school-message.dto';
import { SchoolMessageService } from './school-message.service';

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
const TEACHER_OR_OFFICE = [
  PosSchoolPermission.VIEW_CLASS_BOARD,
  PosSchoolPermission.MARK_ATTENDANCE,
  PosSchoolPermission.ENROL_STUDENT,
];

/**
 * The school's side of the messages with families — the class teacher, the
 * subject teachers and the office. The door is any teaching or office
 * permission; the SERVICE holds each person to the classes they reach.
 */
@ApiTags('School Messages')
@Controller('pos/v1/school/messages')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolMessageController {
  constructor(private readonly svc: SchoolMessageService) {}

  private actor(req: AuthenticatedRequest) {
    const u = (req.user ?? {}) as {
      id?: number;
      email?: string;
      roles?: string[];
    };
    return { id: u.id ?? null, email: u.email ?? null, roles: u.roles ?? null };
  }

  @Get('threads')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...TEACHER_OR_OFFICE)
  list(
    @Query() query: ListSchoolMessageThreadsQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.listThreads(query.branchId, this.actor(req));
  }

  @Get('threads/:id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...TEACHER_OR_OFFICE)
  get(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.getThread(id, branchId, this.actor(req));
  }

  @Post('threads')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_OR_OFFICE)
  open(
    @Body() dto: OpenSchoolMessageThreadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.openThread(dto, this.actor(req));
  }

  @Post('threads/:id/reply')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_OR_OFFICE)
  reply(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplySchoolMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.reply(id, dto, this.actor(req));
  }
}
