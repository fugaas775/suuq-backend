import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleUpgradeRequest } from './entities/role-upgrade-request.entity';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([RoleUpgradeRequest]), forwardRef(() => UsersModule)],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
