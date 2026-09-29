import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ListSchoolMessageThreadsQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;
}

/** The school writes first, to the family of one pupil. */
export class OpenSchoolMessageThreadDto {
  @IsInt()
  branchId!: number;

  @IsInt()
  folioId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body!: string;
}

export class ReplySchoolMessageDto {
  @IsInt()
  branchId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body!: string;
}

/** The family writes, about one of their children. */
export class GuardianPortalSendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body!: string;
}
