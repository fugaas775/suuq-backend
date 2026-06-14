import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateSupplierOfferDto } from './create-supplier-offer.dto';

/**
 * Update accepts every offer field except productId (an offer is bound to its
 * product; create a new offer to cover a different product). All fields optional.
 */
export class UpdateSupplierOfferDto extends PartialType(
  OmitType(CreateSupplierOfferDto, ['productId'] as const),
) {}
