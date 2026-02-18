import {
  Controller,
  Get,
  Query,
  UseGuards,
  Post,
  Param,
  Body,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { CreditService } from '../credit/credit.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsNumber, Min, IsString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class SetLimitDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  limit: number;
}

export class RepayCreditDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller('admin/credit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminCreditController {
  constructor(private readonly creditService: CreditService) {}

  @Get('users')
  async getUsers(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
  ) {
    return this.creditService.findAllLimits(
      Number(page),
      Number(limit),
      search,
    );
  }

  @Post('users/:userId/limit')
  async setLimit(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: SetLimitDto,
  ) {
    // Manual check if ValidationPipe is not global or failed to catch
    if (body.limit === undefined || body.limit === null) {
      throw new BadRequestException('limit is required');
    }
    return this.creditService.setLimit(userId, body.limit);
  }

  @Post('users/:userId/repay')
  async repay(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: RepayCreditDto,
  ) {
    if (body.amount === undefined || body.amount === null) {
      throw new BadRequestException('amount is required');
    }
    return this.creditService.repayCredit(userId, body.amount, body.notes);
  }
}
