import { IsInt, IsString, Min, Max, Length } from 'class-validator';

export class CreateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @Length(3, 1000)
  comment!: string;
}