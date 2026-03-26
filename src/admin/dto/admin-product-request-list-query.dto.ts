import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ProductRequestStatus } from '../../product-requests/entities/product-request.entity';

const toOptionalStatusArray = ({
  value,
}: {
  value: unknown;
}): ProductRequestStatus[] | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const entries = (Array.isArray(value) ? value : String(value).split(','))
    .map((entry) => String(entry).trim().toUpperCase())
    .filter((entry) => entry.length > 0);

  return entries.length > 0 ? (entries as ProductRequestStatus[]) : undefined;
};

export class AdminProductRequestListQueryDto {
  @ApiPropertyOptional({
    enum: ProductRequestStatus,
    isArray: true,
    description:
      'Filter product requests by one or more statuses using a comma-separated query string.',
  })
  @IsOptional()
  @Transform(toOptionalStatusArray)
  @IsEnum(ProductRequestStatus, { each: true })
  status?: ProductRequestStatus[];

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
