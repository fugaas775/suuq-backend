import { PartialType } from '@nestjs/swagger';
import { CreateSupplierProfileDto } from './create-supplier-profile.dto';

/**
 * Every field is optional on update; the service only persists provided fields
 * and only allows edits while the profile is DRAFT or REJECTED.
 */
export class UpdateSupplierProfileDto extends PartialType(
  CreateSupplierProfileDto,
) {}
