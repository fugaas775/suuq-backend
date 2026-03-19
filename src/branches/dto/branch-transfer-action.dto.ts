import { IsOptional, IsString } from 'class-validator';

export class BranchTransferActionDto {
  @IsOptional()
  @IsString()
  note?: string;
}
