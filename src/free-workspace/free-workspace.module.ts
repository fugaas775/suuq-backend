import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountFreeWorkspaceGrant } from './entities/account-free-workspace-grant.entity';
import { FreeWorkspaceGrantService } from './free-workspace-grant.service';

/**
 * Leaf module: one entity, one service, no dependency on anything else in the
 * app. It has to be reachable from both the POS onboarding path (BranchStaff /
 * Retail) and the supplier onboarding path (Suppliers), and those two already
 * sit on opposite sides of the module graph — importing either from the other
 * to share this would create the cycle. Global so both simply inject it.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AccountFreeWorkspaceGrant])],
  providers: [FreeWorkspaceGrantService],
  exports: [FreeWorkspaceGrantService],
})
export class FreeWorkspaceModule {}
