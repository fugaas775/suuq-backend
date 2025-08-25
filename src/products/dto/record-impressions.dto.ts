import { IsArray, ArrayMinSize, IsInt, Min, IsOptional, IsString } from 'class-validator';

export class RecordImpressionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  productIds!: number[];

  // Optional client-provided session/window identifier for stronger idempotency across tabs
  @IsOptional()
  @IsString()
  sessionId?: string;

  // Optional window size in seconds (defaults server-side to 300)
  @IsOptional()
  @IsInt()
  @Min(60)
  windowSeconds?: number;
}
