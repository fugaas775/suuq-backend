import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ListSchoolRoomsQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}

export class CreateSchoolRoomDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsIn(['DESK', 'MAT'])
  seating?: 'DESK' | 'MAT';

  @IsOptional()
  @IsInt()
  @Min(0)
  desks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  brokenDesks?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  seatsPerDesk?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  matCapacity?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateSchoolRoomDto extends CreateSchoolRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  declare name: string;
}

export class DeleteSchoolRoomQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}
