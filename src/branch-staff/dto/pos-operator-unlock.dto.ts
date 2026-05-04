import { Transform, Type } from 'class-transformer';
import { IsNumber, IsString, MaxLength, Min } from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class PosOperatorUnlockDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  branchId!: number;

  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => trimString(value))
  identifier!: string;

  @IsString()
  @MaxLength(255)
  password!: string;

  resolveIdentifier() {
    return String(this.identifier || '').trim();
  }
}

export enum PosManagerApprovalType {
  REOPEN_SETTLED_BILL = 'REOPEN_SETTLED_BILL',
  VOID_SETTLED_BILL = 'VOID_SETTLED_BILL',
  CASH_TENDER_OVERRIDE = 'CASH_TENDER_OVERRIDE',
}

export class PosManagerApprovalDto extends PosOperatorUnlockDto {
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimString(value))
  approvalType!: PosManagerApprovalType;
}
