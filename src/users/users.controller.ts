import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
  UnauthorizedException,
  Put,
  Body,
  Query,
  Patch,
  Res,
  Header,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from './dto/user-response.dto';
import { AuthenticatedRequest } from '../auth/auth.types';
import { UserRole } from '../auth/roles.enum';
import { UpdateUserDto } from './dto/update-user.dto';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { Response } from 'express';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * --- NEW: Endpoint to get all users, filterable by role and search ---
   * This will power the "Companies" tab (by filtering for role=VENDOR)
   */
  @Get()
  @Roles(UserRole.ADMIN)
  async getAllUsers(
    @Query() filters: FindUsersQueryDto,
    @Query('meta') metaFlag?: string,
  ): Promise<any> {
    const { users, total, page, pageSize } = await this.usersService.findAll(
      filters,
    );
    const data = users.map((user: any) =>
      plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    );
    if (metaFlag === '1') {
      return { data, meta: { total, page, pageSize } };
    }
    return data;
  }

  @Patch('me')
  async updateOwnProfile(
    @Req() req: AuthenticatedRequest,
    @Body() data: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();

    // Prevent changing sensitive fields
    delete data.roles;
    delete data.email;
    delete data.password;

    const user = await this.usersService.update(userId, data);
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  // Allow clients that use PUT /users/me (alias of PATCH)
  @Put('me')
  async putOwnProfile(
    @Req() req: AuthenticatedRequest,
    @Body() data: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();

    // Prevent changing sensitive fields
    delete data.roles;
    delete data.email;
    delete data.password;

    const user = await this.usersService.update(userId, data);
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  // Password change for current user (accept multiple verbs to match clients)
  @Put('me/password')
  @Patch('me/password')
  async changeOwnPassword(@Req() req: AuthenticatedRequest, @Body() body: any) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    const current =
      body.currentPassword || body.oldPassword || body.passwordCurrent;
    const next = body.newPassword || body.password || body.new_password;
    if (!next) {
      throw new Error('New password is required.');
    }
    await this.usersService.changePassword(userId, current, next);
    return { success: true } as any;
  }

  // POST alias for clients using /users/me/change-password
  @Put('me/change-password')
  @Patch('me/change-password')
  async changeOwnPasswordAlias(
    @Req() req: AuthenticatedRequest,
    @Body() body: any,
  ) {
    return this.changeOwnPassword(req, body);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  async getUser(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponseDto | undefined> {
    const user = await this.usersService.findById(id);
    // Build a weak ETag based on stable fields: id + updatedAt timestamp (ms) + verification status
    const updated = (user as any)?.updatedAt?.getTime?.() || 0;
    const tagBase = `${user.id}:${updated}:${user.verificationStatus || ''}`;
    // Simple hash (FNV-1a like) for compactness
    let hash = 2166136261;
    for (let i = 0; i < tagBase.length; i++) {
      hash ^= tagBase.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    const etag = 'W/"u-' + hash.toString(16) + '"';
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === etag) {
      res.setHeader('ETag', etag);
      res.status(304);
      return; // no body
    }
    res.setHeader('ETag', etag);
    // Cache hints for intermediaries / browser (can be tuned)
    res.setHeader('Cache-Control', 'private, max-age=15');
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.update(id, data);
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Put(':id/deactivate')
  @Roles(UserRole.ADMIN)
  async deactivateUser(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.deactivate(id);
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Put(':id/reactivate')
  @Roles(UserRole.ADMIN)
  async reactivateUser(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.reactivate(id);
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async removeUser(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.usersService.remove(id);
  }

  @Patch(':id/verify')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async verifyUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; reason?: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    const status = body?.status;
    if (status !== 'APPROVED' && status !== 'REJECTED') {
      throw new Error("Invalid status. Use 'APPROVED' or 'REJECTED'.");
    }
    const user = await this.usersService.setVerificationStatus(
      id,
      status as any,
      req.user?.email,
      body.reason,
    );
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Export users (current filters & sorting). If all=1 provided, export all rows (capped by safety limit).
   */
  @Get('export/csv')
  @Roles(UserRole.ADMIN)
  @Header('Content-Type', 'text/csv')
  async exportCsv(
    @Res() res: Response,
    @Query() filters: FindUsersQueryDto,
    @Query('all') all?: string,
  ) {
    // Force meta for pagination if not exporting all
    if (all === '1') {
      filters.page = 1;
      filters.pageSize = 10000; // upper bound for single export
    }
    const { users } = await this.usersService.findAll(filters);
    const header = [
      'id',
      'email',
      'displayName',
      'verificationStatus',
      'verified',
      'verificationRejectionReason',
      'createdAt',
    ];
    const lines = [header.join(',')];
    for (const u of users) {
      lines.push(
        [
          u.id,
          JSON.stringify(u.email || ''),
          JSON.stringify(u.displayName || ''),
          u.verificationStatus,
            u.verified ? 'true' : 'false',
          JSON.stringify(u.verificationRejectionReason || ''),
          u.createdAt?.toISOString?.() || '',
        ].join(','),
      );
    }
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="users-${Date.now()}.csv"`,
    );
    res.send(lines.join('\n'));
  }
}
