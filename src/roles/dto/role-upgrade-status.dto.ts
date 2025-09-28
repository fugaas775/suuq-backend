import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../auth/roles.enum';
import { RoleUpgradeStatus } from '../entities/role-upgrade-request.entity';

export class RoleUpgradeStatusDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ enum: RoleUpgradeStatus })
  status!: RoleUpgradeStatus;

  @ApiProperty({ isArray: true, enum: UserRole })
  roles!: UserRole[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
