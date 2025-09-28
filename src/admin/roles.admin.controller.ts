import { Controller, Get, Query, UseGuards, Post, Body, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { RolesService } from '../roles/roles.service';
import { SkipThrottle } from '@nestjs/throttler';
import { RoleUpgradeStatus } from '../roles/entities/role-upgrade-request.entity';

@ApiTags('Admin - Roles')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN)
@Controller('admin/roles')
export class AdminRolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('requests')
  @ApiOperation({ summary: 'List role upgrade requests' })
  @ApiQuery({ name: 'status', enum: RoleUpgradeStatus, required: false })
  async list(@Query('status') status?: RoleUpgradeStatus) {
    return this.rolesService.listRequests(status as RoleUpgradeStatus);
  }

  @Post('approve')
  @ApiOperation({ summary: 'Approve role upgrade request by requestId or userId' })
  @ApiBody({ schema: { properties: { requestId: { type: 'number', nullable: true }, userId: { type: 'number', nullable: true }, roles: { type: 'array', items: { type: 'string', enum: Object.values(UserRole) } } } } })
  async approve(
    @Body('requestId') requestId?: number,
    @Body('userId') userId?: number,
    @Body('roles') roles?: string[],
    @Body('actedBy') actedBy?: string,
  ) {
    let result;
    if (requestId) {
      result = await this.rolesService.approveRequest(Number(requestId), actedBy || 'admin');
    } else if (userId) {
      result = await this.rolesService.approveForUser(Number(userId), roles as any, actedBy || 'admin');
    } else {
      throw new (require('@nestjs/common').BadRequestException)('requestId or userId is required');
    }
    return { id: result.id, status: result.status };
  }

  @Post('reject')
  @ApiOperation({ summary: 'Reject role upgrade request by requestId or userId' })
  @ApiBody({ schema: { properties: { requestId: { type: 'number', nullable: true }, userId: { type: 'number', nullable: true }, reason: { type: 'string', nullable: true } } } })
  async reject(
    @Body('requestId') requestId?: number,
    @Body('userId') userId?: number,
    @Body('reason') reason?: string,
    @Body('actedBy') actedBy?: string,
  ) {
    let result;
    if (requestId) {
      result = await this.rolesService.rejectRequest(Number(requestId), reason, actedBy || 'admin');
    } else if (userId) {
      result = await this.rolesService.rejectForUser(Number(userId), reason, actedBy || 'admin');
    } else {
      throw new (require('@nestjs/common').BadRequestException)('requestId or userId is required');
    }
    return { id: result.id, status: result.status, reason: result.decisionReason };
  }
}
