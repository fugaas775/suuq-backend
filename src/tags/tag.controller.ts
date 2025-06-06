import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Query,
} from '@nestjs/common';
import { TagService } from './tag.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../../users/user-role.enum'; // <-- Import your enum

@Controller('tags')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Get('suggest')
  suggestTags(@Query('q') q: string) {
    return this.tagService.suggestTags(q);
  }

  @Get()
  findAll() {
    return this.tagService.findAll();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN) // <-- Use enum
  @Post()
  create(@Body('name') name: string) {
    return this.tagService.create(name);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN) // <-- Use enum
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.tagService.delete(id);
  }
}
