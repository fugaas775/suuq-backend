import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BranchStaffRole } from '../entities/branch-staff-assignment.entity';

export class BranchStaffUserSummaryDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;
}

export class BranchStaffAssignmentResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  userId!: number;

  @ApiProperty({ enum: BranchStaffRole })
  role!: BranchStaffRole;

  @ApiProperty({ isArray: true })
  permissions!: string[];

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: BranchStaffUserSummaryDto, nullable: true })
  user!: BranchStaffUserSummaryDto | null;
}

export class BranchStaffInviteResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: BranchStaffRole })
  role!: BranchStaffRole;

  @ApiProperty({ isArray: true })
  permissions!: string[];

  @ApiPropertyOptional({ nullable: true })
  invitedByUserId!: number | null;

  @ApiPropertyOptional({ nullable: true })
  acceptedByUserId!: number | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional({ nullable: true })
  acceptedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class InviteBranchStaffResponseDto {
  @ApiProperty({ enum: ['PENDING_SIGNUP', 'LINKED_EXISTING_USER'] })
  status!: 'PENDING_SIGNUP' | 'LINKED_EXISTING_USER';

  @ApiProperty({ type: BranchStaffInviteResponseDto })
  invite!: BranchStaffInviteResponseDto;

  @ApiPropertyOptional({
    type: BranchStaffAssignmentResponseDto,
    nullable: true,
  })
  assignment!: BranchStaffAssignmentResponseDto | null;
}

export class BranchStaffInviteActionResponseDto {
  @ApiProperty({ enum: ['RESENT', 'REVOKED'] })
  status!: 'RESENT' | 'REVOKED';

  @ApiProperty({ type: BranchStaffInviteResponseDto })
  invite!: BranchStaffInviteResponseDto;
}
