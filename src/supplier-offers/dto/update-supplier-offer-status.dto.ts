import { IsEnum } from 'class-validator';
import { SupplierOfferStatus } from '../entities/supplier-offer.entity';

export class UpdateSupplierOfferStatusDto {
  @IsEnum(SupplierOfferStatus)
  status!: SupplierOfferStatus;
}
