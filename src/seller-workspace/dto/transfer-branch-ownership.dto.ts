import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class TransferBranchOwnershipDto {
  /** Email address of the new branch owner. */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  newOwnerEmail!: string;
}
