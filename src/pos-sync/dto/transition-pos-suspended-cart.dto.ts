import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * How a guest's request ended, told to the server rather than inferred.
 *
 * Discarding is how a row leaves the board, and it is how BOTH outcomes look:
 * a settled order and a rejected one are the same DISCARDED row. The register
 * used to distinguish them by PATCHing a completion stamp just before the
 * discard — fire-and-forget, and racing it. When the PATCH lost, a guest who
 * had just paid and collected was told their order was cancelled, and the
 * retry could not even land because the row was no longer SUSPENDED.
 *
 * Sending the outcome with the transition makes it one write that cannot race.
 */
export const CONSUMER_REQUEST_OUTCOMES = ['COMPLETED', 'DECLINED'] as const;

export class TransitionPosSuspendedCartDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  /** Only meaningful on a discard, and only for a guest's own request. */
  @ApiPropertyOptional({ enum: CONSUMER_REQUEST_OUTCOMES })
  @IsOptional()
  @IsString()
  @IsIn(CONSUMER_REQUEST_OUTCOMES)
  outcome?: string;

  /**
   * Why the shop could not take it, shown to the guest.
   *
   * "This order was cancelled. Talk to the staff." is what a guest saw for
   * every refusal, which tells them to make a journey to find out something the
   * shop already knew.
   */
  @ApiPropertyOptional({
    example: 'We close at 8pm — can you collect tomorrow?',
  })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  declineReason?: string;

  /**
   * This discard is a school taking a pupil off the roll — sent by Seller HQ's
   * Students panel, the one place a withdrawal is offered. It changes nothing
   * about the discard itself; it asks the server to email the branch owner a
   * record of who left the roll, because a withdrawal destroys the folio the
   * roll would otherwise remember them by.
   */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  withdrawal?: boolean;
}
