import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
  Request as NestRequest,
  UnauthorizedException,
  Put,
  Body,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from './dto/user-response.dto';
import { AuthenticatedRequest } from '../auth/auth.types'; // ✅ Add this

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('ADMIN')
  async getAllUsers() {
    const users = await this.usersService.findAll();
    return users.map(user => plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }));
  }

  @Get('me')
@UseGuards(AuthGuard('jwt'))
async getMe(@NestRequest() req: AuthenticatedRequest) {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedException();

  const user = await this.usersService.getMe(userId);

  return plainToInstance(UserResponseDto, user, {
    excludeExtraneousValues: true,
  });
}


  

  @Get(':id')
  @Roles('ADMIN')
  async getUser(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    const user = await this.usersService.findById(id);
    return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
  }

  @Put(':id')
  @Roles('ADMIN')
  async updateUser(@Param('id', ParseIntPipe) id: number, @Body() data: any) {
    const user = await this.usersService.update(id, data);
    return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
  }

  @Put(':id/deactivate')
  @Roles('ADMIN')
  async deactivateUser(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.deactivate(id);
  }

  @Put(':id/reactivate')
  @Roles('ADMIN')
  async reactivateUser(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.reactivate(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  removeUser(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }
}

