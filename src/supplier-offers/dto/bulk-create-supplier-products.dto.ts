import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateSupplierProductDto } from './create-supplier-product.dto';

/**
 * Bulk supplier product+offer creation — the supplier-portal mirror of the
 * branch bulk product importer. Each row is created independently with
 * row-level success/failure reporting, so one bad row never aborts the batch.
 */
export class BulkCreateSupplierProductsDto {
  @ApiProperty({ type: [CreateSupplierProductDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateSupplierProductDto)
  items!: CreateSupplierProductDto[];
}
