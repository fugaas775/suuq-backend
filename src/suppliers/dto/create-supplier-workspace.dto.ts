import { CreateSupplierProfileDto } from './create-supplier-profile.dto';

/**
 * Payload for self-serve supplier-account onboarding (the supplier-side mirror
 * of CreatePosWorkspaceDto). Same shape as creating a supplier profile.
 */
export class CreateSupplierWorkspaceDto extends CreateSupplierProfileDto {}
