import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { BootstrapSellerWorkspaceDto } from './dto/bootstrap-seller-workspace.dto';
import { CreateSellerBranchWorkspaceDto } from './dto/create-seller-branch-workspace.dto';
import { SellerWorkspaceQueryDto } from './dto/seller-workspace-query.dto';
import {
  SellerWorkspaceAccessDeniedResponseDto,
  SellerWorkspaceBranchWorkspaceDto,
  SellerWorkspaceBranchWorkspacesResponseDto,
  SellerWorkspaceOverviewResponseDto,
  SellerWorkspacePlansResponseDto,
  SellerWorkspaceProfileResponseDto,
  SellerWorkspaceStateResponseDto,
} from './dto/seller-workspace-response.dto';
import { UpdateSellerWorkspaceChannelDto } from './dto/update-seller-workspace-channel.dto';
import { UpdateSellerWorkspaceOnboardingDto } from './dto/update-seller-workspace-onboarding.dto';
import { UpdateSellerWorkspacePlanDto } from './dto/update-seller-workspace-plan.dto';
import { UpdateBranchServiceFormatDto } from './dto/update-branch-service-format.dto';
import { UpdateBranchWorkspaceDto } from './dto/update-branch-workspace.dto';
import { SellerWorkspaceService } from './seller-workspace.service';

@ApiTags('Seller Workspace')
@Controller('seller/v1/workspace')
@UseGuards(JwtAuthGuard)
@ApiForbiddenResponse({ type: SellerWorkspaceAccessDeniedResponseDto })
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
export class SellerWorkspaceController {
  constructor(
    private readonly sellerWorkspaceService: SellerWorkspaceService,
  ) {}

  @Post('bootstrap')
  @ApiOkResponse({ type: SellerWorkspaceStateResponseDto })
  bootstrap(
    @Req() req: AuthenticatedRequest,
    @Body() dto: BootstrapSellerWorkspaceDto,
  ) {
    return this.sellerWorkspaceService.bootstrapWorkspace(req.user.id, dto);
  }

  @Get('profile')
  @ApiOkResponse({ type: SellerWorkspaceProfileResponseDto })
  profile(
    @Req() req: AuthenticatedRequest,
    @Query() query: SellerWorkspaceQueryDto,
  ) {
    return this.sellerWorkspaceService.getProfile(
      req.user.id,
      query.windowHours,
    );
  }

  @Get('overview')
  @ApiOkResponse({ type: SellerWorkspaceOverviewResponseDto })
  overview(
    @Req() req: AuthenticatedRequest,
    @Query() query: SellerWorkspaceQueryDto,
  ) {
    return this.sellerWorkspaceService.getOverview(
      req.user.id,
      query.windowHours,
    );
  }

  @Get('plans')
  @ApiOkResponse({ type: SellerWorkspacePlansResponseDto })
  plans(
    @Req() req: AuthenticatedRequest,
    @Query() query: SellerWorkspaceQueryDto,
  ) {
    return this.sellerWorkspaceService.getPlans(req.user.id, query.windowHours);
  }

  @Get('branch-workspaces')
  @ApiOkResponse({ type: SellerWorkspaceBranchWorkspacesResponseDto })
  branchWorkspaces(@Req() req: AuthenticatedRequest) {
    return this.sellerWorkspaceService.getBranchWorkspaces(req.user.id);
  }

  @Post('branch-workspaces')
  @ApiOkResponse({ type: SellerWorkspaceBranchWorkspaceDto })
  createBranchWorkspace(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSellerBranchWorkspaceDto,
  ) {
    return this.sellerWorkspaceService.createBranchWorkspace(req.user.id, dto);
  }

  @Patch('plan')
  @ApiOkResponse({ type: SellerWorkspaceStateResponseDto })
  updatePlan(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateSellerWorkspacePlanDto,
  ) {
    return this.sellerWorkspaceService.updatePlanSelection(req.user.id, dto);
  }

  @Patch('onboarding')
  @ApiOkResponse({ type: SellerWorkspaceStateResponseDto })
  updateOnboarding(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateSellerWorkspaceOnboardingDto,
  ) {
    return this.sellerWorkspaceService.updateOnboardingStep(req.user.id, dto);
  }

  @Patch('channels/:channelKey')
  @ApiOkResponse({ type: SellerWorkspaceStateResponseDto })
  updateChannel(
    @Req() req: AuthenticatedRequest,
    @Param('channelKey') channelKey: string,
    @Body() dto: UpdateSellerWorkspaceChannelDto,
  ) {
    return this.sellerWorkspaceService.updateChannelState(
      req.user.id,
      channelKey,
      dto,
    );
  }

  @Patch('branch-workspaces/:branchId')
  @ApiOkResponse({ type: SellerWorkspaceBranchWorkspaceDto })
  updateBranchWorkspace(
    @Req() req: AuthenticatedRequest,
    @Param('branchId') branchId: number,
    @Body() dto: UpdateBranchWorkspaceDto,
  ) {
    return this.sellerWorkspaceService.updateBranchWorkspace(
      req.user.id,
      branchId,
      dto,
    );
  }

  @Patch('branch-workspaces/:branchId/service-format')
  @ApiOkResponse({ type: SellerWorkspaceBranchWorkspaceDto })
  updateBranchServiceFormat(
    @Req() req: AuthenticatedRequest,
    @Param('branchId') branchId: number,
    @Body() dto: UpdateBranchServiceFormatDto,
  ) {
    return this.sellerWorkspaceService.updateBranchWorkspaceServiceFormat(
      req.user.id,
      branchId,
      dto,
    );
  }
}
