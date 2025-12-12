import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum ForwardChannel {
  IN_APP = 'IN_APP',
  WHATSAPP = 'WHATSAPP',
  CALL = 'CALL',
  OTHER = 'OTHER',
}

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

export class AdminForwardProductRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @Transform(toIntArray)
  @IsInt({ each: true })
  @Min(1, { each: true })
  vendorIds!: number[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;

  @IsOptional()
  @IsEnum(ForwardChannel)
  channel?: ForwardChannel;
}
