import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { BranchTransfersService } from './branch-transfers.service';
import { BranchTransferActionDto } from './dto/branch-transfer-action.dto';
import { CreateBranchTransferDto } from './dto/create-branch-transfer.dto';
import { ListBranchTransfersQueryDto } from './dto/list-branch-transfers-query.dto';

@ApiTags('Branch Transfers')
@Controller('hub/v1/branch-transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchTransfersController {
  constructor(
    private readonly branchTransfersService: BranchTransfersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List persisted branch transfer documents' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  findAll(@Query() query: ListBranchTransfersQueryDto) {
    return this.branchTransfersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a branch transfer document by ID' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.branchTransfersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a requested branch transfer document' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  create(@Body() dto: CreateBranchTransferDto, @Req() req: any) {
    return this.branchTransfersService.create(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Patch(':id/dispatch')
  @ApiOperation({
    summary: 'Dispatch a requested branch transfer and reserve outbound stock',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  dispatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BranchTransferActionDto,
    @Req() req: any,
  ) {
    return this.branchTransfersService.dispatch(
      id,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
      },
      dto.note,
    );
  }

  @Patch(':id/receive')
  @ApiOperation({
    summary: 'Receive a dispatched branch transfer and post stock movements',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  receive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BranchTransferActionDto,
    @Req() req: any,
  ) {
    return this.branchTransfersService.receive(
      id,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
      },
      dto.note,
    );
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a requested or dispatched branch transfer' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BranchTransferActionDto,
    @Req() req: any,
  ) {
    return this.branchTransfersService.cancel(
      id,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
      },
      dto.note,
    );
  }
}
