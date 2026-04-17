import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../auth/roles.enum';
import {
  PosPortalActivationCandidateDto,
  PosPortalBranchSummaryDto,
} from './pos-portal-auth-response.dto';

export class PosSupportDiagnosticUserDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserRole, isArray: true })
  roles!: UserRole[];

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;
}

export class PosSupportDiagnosticSummaryDto {
  @ApiProperty({
    enum: [
      'USER_NOT_FOUND',
      'ACTIVE_BRANCH_ACCESS',
      'ACTIVATION_REQUIRED',
      'NO_BRANCH_ACCESS',
    ],
  })
  status!:
    | 'USER_NOT_FOUND'
    | 'ACTIVE_BRANCH_ACCESS'
    | 'ACTIVATION_REQUIRED'
    | 'NO_BRANCH_ACCESS';

  @ApiProperty()
  branchAssignmentCount!: number;

  @ApiProperty()
  activationCandidateCount!: number;

  @ApiProperty()
  canOpenNow!: boolean;

  @ApiPropertyOptional({ nullable: true })
  likelyRootCause!: string | null;

  @ApiProperty({ type: [String] })
  recommendedActions!: string[];
}

export class PosSupportPortalDiagnosticResponseDto {
  @ApiProperty()
  searchedEmail!: string;

  @ApiPropertyOptional({ type: PosSupportDiagnosticUserDto, nullable: true })
  user!: PosSupportDiagnosticUserDto | null;

  @ApiProperty({ type: PosPortalBranchSummaryDto, isArray: true })
  branchAssignments!: PosPortalBranchSummaryDto[];

  @ApiProperty({ type: PosPortalActivationCandidateDto, isArray: true })
  workspaceActivationCandidates!: PosPortalActivationCandidateDto[];

  @ApiProperty({ type: PosSupportDiagnosticSummaryDto })
  summary!: PosSupportDiagnosticSummaryDto;
}
