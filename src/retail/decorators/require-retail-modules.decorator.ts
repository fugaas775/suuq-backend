import { SetMetadata } from '@nestjs/common';
import { RetailModule } from '../entities/tenant-module-entitlement.entity';

export const RETAIL_MODULES_KEY = 'retail-modules';

export const RequireRetailModules = (...modules: RetailModule[]) =>
  SetMetadata(RETAIL_MODULES_KEY, modules);
