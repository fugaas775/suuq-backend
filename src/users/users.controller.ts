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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from './dto/user-response.dto';
import { AuthenticatedRequest } from '../auth/auth.types';
import { UserRole } from '../auth/roles.enum';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  async getAllUsers(): Promise<UserResponseDto[]> {
    const users = await this.usersService.findAll();
    return users.map(user =>
      plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true })
    );
  }

  @Get('me')
  async getMe(@Req() req: AuthenticatedRequest): Promise<UserResponseDto> {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();

    const user = await this.usersService.getMe(userId);
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  async getUser(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    const user = await this.usersService.findById(id);
    return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateUserDto
  ): Promise<UserResponseDto> {
    const user = await this.usersService.update(id, data);
    return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
  }

  @Put(':id/deactivate')
  @Roles(UserRole.ADMIN)
  async deactivateUser(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    const user = await this.usersService.deactivate(id);
    return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
  }

  @Put(':id/reactivate')
  @Roles(UserRole.ADMIN)
  async reactivateUser(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    const user = await this.usersService.reactivate(id);
    return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async removeUser(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.usersService.remove(id);
  }
}