import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class KitchenProductAvailabilityOverrideDto {
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => String(value ?? '').trim())
  productId!: string;

  /** false = unavailable; true = reset to available */
  @IsBoolean()
  available!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  @Type(() => Number)
  qtyRemaining?: number | null;
}

export class PatchKitchenProductAvailabilityDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique((o: KitchenProductAvailabilityOverrideDto) => o.productId)
  @ValidateNested({ each: true })
  @Type(() => KitchenProductAvailabilityOverrideDto)
  overrides!: KitchenProductAvailabilityOverrideDto[];
}
