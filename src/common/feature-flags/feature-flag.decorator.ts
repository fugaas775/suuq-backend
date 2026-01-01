import { SetMetadata } from '@nestjs/common';

export const FEATURE_FLAG_KEY = 'feature_flag_required';
export const RequireFeature = (flagName: string) =>
  SetMetadata(FEATURE_FLAG_KEY, flagName);
