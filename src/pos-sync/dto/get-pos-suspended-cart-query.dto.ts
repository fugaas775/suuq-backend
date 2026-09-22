import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber } from 'class-validator';

/**
 * One folio, read fresh.
 *
 * The branch rides on the query so the branch-access guard can check it, and
 * the row is answered only when it sits on that branch — an id from another
 * school is a 404, never somebody else's pupil.
 */
export class GetPosSuspendedCartQueryDto {
  @ApiProperty({ example: 115 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;
}
