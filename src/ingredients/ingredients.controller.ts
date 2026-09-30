import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import {
  BranchQueryDto,
  CreateIngredientDto,
  IngredientMovementsQueryDto,
  IngredientUsageQueryDto,
  ListIngredientsQueryDto,
  RecipesQueryDto,
  RecordIngredientMovementDto,
  ReplaceRecipeDto,
  UpdateIngredientDto,
} from './dto/ingredients.dto';
import { IngredientsActor, IngredientsService } from './ingredients.service';

const GUARDS = [
  JwtAuthGuard,
  RolesGuard,
  RetailModulesGuard,
  PosBranchAccessGuard,
];

/**
 * Who may CHANGE the shelf: the owner, an admin, a branch manager. A manager
 * at the POS gate carries POS_MANAGER on their token, an operator carries
 * POS_OPERATOR, so listing the three here is what keeps a purchaser's or
 * cashier's token off the writes. The service checks the same thing again
 * from the claims, because a guard that is re-ordered later should not be the
 * only thing standing between a waiter and the recipe book.
 */
const WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
] as const;

/**
 * The kitchen's shelf: ingredients, what they cost, what each plate uses.
 *
 * POS_OPERATOR is in the class role list because a purchaser standing in a
 * market needs to READ what is running low — that is the whole point of the
 * list on their run editor. The per-route role list is what does the
 * separating on writes.
 */
@ApiTags('Ingredients')
@Controller('pos/v1/ingredients')
@UseGuards(...GUARDS)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class IngredientsController {
  constructor(private readonly svc: IngredientsService) {}

  /**
   * Mirrors purchasing's `actorFrom`: an owner, a global admin, a branch
   * manager by role or by the token's branchRole claim.
   */
  private actorFrom(req: AuthenticatedRequest): IngredientsActor {
    const user = (req.user ?? {}) as Record<string, unknown>;
    const roles = Array.isArray(user.roles)
      ? (user.roles as string[]).map((role) =>
          String(role || '')
            .trim()
            .toUpperCase(),
        )
      : [];
    const branchRole = String(user.branchRole || '')
      .trim()
      .toUpperCase();
    const isManagerLike =
      user.isOwner === true ||
      user.isTenantOwner === true ||
      branchRole === 'MANAGER' ||
      roles.some((role) =>
        ['SUPER_ADMIN', 'ADMIN', 'POS_MANAGER'].includes(role),
      );
    return {
      userId: Number(user.id) || null,
      name:
        (typeof user.displayName === 'string' && user.displayName.trim()) ||
        (typeof user.email === 'string' && user.email.trim()) ||
        null,
      isManagerLike,
    };
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  @Get()
  @RetailBranchContext('query.branchId')
  list(@Req() req: AuthenticatedRequest, @Query() query: ListIngredientsQueryDto) {
    return this.svc.list(query, this.actorFrom(req));
  }

  @Get('low-stock')
  @RetailBranchContext('query.branchId')
  lowStock(@Query() query: BranchQueryDto) {
    return this.svc.lowStock(query.branchId);
  }

  @Get('usage')
  @RetailBranchContext('query.branchId')
  usage(@Query() query: IngredientUsageQueryDto) {
    return this.svc.usage(query.branchId, query.from, query.to);
  }

  @Get('recipes')
  @RetailBranchContext('query.branchId')
  recipes(@Query() query: RecipesQueryDto) {
    return this.svc.getRecipes(query.branchId, query.productId);
  }

  @Get(':id/movements')
  @RetailBranchContext('query.branchId')
  movements(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: IngredientMovementsQueryDto,
  ) {
    return this.svc.listMovements(id, query);
  }

  // ── Writes ───────────────────────────────────────────────────────────────

  @Put('recipes/:productId')
  @Roles(...WRITE_ROLES)
  @RetailBranchContext('body.branchId')
  replaceRecipe(
    @Req() req: AuthenticatedRequest,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: ReplaceRecipeDto,
  ) {
    return this.svc.replaceRecipe(
      dto.branchId,
      productId,
      dto,
      this.actorFrom(req),
    );
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @RetailBranchContext('body.branchId')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateIngredientDto) {
    return this.svc.create(dto, this.actorFrom(req));
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @RetailBranchContext('body.branchId')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.svc.update(id, dto, this.actorFrom(req));
  }

  @Post(':id/movements')
  @Roles(...WRITE_ROLES)
  @RetailBranchContext('body.branchId')
  record(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordIngredientMovementDto,
  ) {
    return this.svc.record(id, dto, this.actorFrom(req));
  }
}
