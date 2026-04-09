import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateVendorProductDto } from './create-vendor-product.dto';

export class BulkCreateVendorProductsRowResultDto {
  @ApiProperty()
  rowIndex!: number;

  @ApiProperty()
  productId!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: 'publish' })
  status!: string;
}

export class BulkCreateVendorProductsFailureDto {
  @ApiProperty()
  rowIndex!: number;

  @ApiProperty({ type: CreateVendorProductDto })
  row!: CreateVendorProductDto;

  @ApiProperty()
  error!: string;
}

export class BulkCreateVendorProductsDto {
  @ApiPropertyOptional({
    default: true,
    description: 'Continue processing remaining rows after a row fails.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  continueOnError?: boolean;

  @ApiProperty({ type: [CreateVendorProductDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVendorProductDto)
  rows!: CreateVendorProductDto[];
}

export class BulkCreateVendorProductsResponseDto {
  @ApiProperty()
  totalRows!: number;

  @ApiProperty()
  createdCount!: number;

  @ApiProperty()
  failedCount!: number;

  @ApiProperty()
  stoppedEarly!: boolean;

  @ApiProperty({ type: [BulkCreateVendorProductsRowResultDto] })
  created!: BulkCreateVendorProductsRowResultDto[];

  @ApiProperty({ type: [BulkCreateVendorProductsFailureDto] })
  failures!: BulkCreateVendorProductsFailureDto[];
}
