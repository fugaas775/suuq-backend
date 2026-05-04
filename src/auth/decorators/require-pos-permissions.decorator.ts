import { SetMetadata } from '@nestjs/common';

export const POS_REQUIRED_PERMISSIONS_KEY = 'pos:required-permissions';

export const RequirePosPermissions = (...permissions: string[]) =>
  SetMetadata(POS_REQUIRED_PERMISSIONS_KEY, permissions);
