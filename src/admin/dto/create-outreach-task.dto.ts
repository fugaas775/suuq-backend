import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const toIntArray = ({ value }: { value: unknown }): number[] | undefined => {
  if (value === null || typeof value === 'undefined') return undefined;
  const list = Array.isArray(value) ? value : String(value).split(',');
  const parsed = list
    .map((item) => {
      const num = Number(item);
      return Number.isInteger(num) && num > 0 ? num : undefined;
    })
    .filter((num): num is number => typeof num === 'number');
  const unique = Array.from(new Set(parsed));
  return unique.length ? unique : undefined;
};

export class CreateOutreachTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  term!: string;

  @IsArray()
  @ArrayMinSize(1)
  @Transform(toIntArray)
  @IsInt({ each: true })
  @Min(1, { each: true })
  requestIds!: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedVendorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;

  @ValidateIf((o) => typeof o.payload !== 'undefined')
  @Transform(({ value }) => {
    if (value === null || typeof value === 'undefined') return undefined;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value as string);
    } catch {
      return {};
    }
  })
  payload?: Record<string, any>;
}
