import { Body, Controller, Post, UseGuards, Req, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags, ApiNoContentResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesService } from './roles.service';
import { RequestRoleUpgradeDto } from './dto/request-upgrade.dto';
import { RoleUpgradeStatusDto } from './dto/role-upgrade-status.dto';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post('upgrade-request')
  @ApiOperation({ summary: 'Create or return a pending role upgrade request for current user' })
  @ApiBody({ type: RequestRoleUpgradeDto })
  @ApiOkResponse({ schema: { properties: { id: { type: 'number' }, status: { type: 'string' } } } })
  async requestUpgrade(@Req() req, @Body() dto: RequestRoleUpgradeDto) {
    const userId = req.user.id as number;
    const result = await this.rolesService.requestUpgrade(userId, dto);
    return { id: result.id, status: result.status };
  }

  @Get('upgrade-request/me')
  @ApiOperation({ summary: 'Get the latest role upgrade request for current user' })
  @ApiOkResponse({ type: RoleUpgradeStatusDto })
  @ApiNoContentResponse({ description: 'No upgrade request for user' })
  async myLatest(@Req() req, @Res({ passthrough: true }) res: Response): Promise<RoleUpgradeStatusDto | void> {
    const userId = req.user.id as number;
    const r = await this.rolesService.getLatestForUser(userId);
    if (!r) {
      res.status(HttpStatus.NO_CONTENT);
      return;
    }
    return {
      id: r.id,
      status: r.status,
      roles: r.roles,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
