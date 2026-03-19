import { SetMetadata } from '@nestjs/common';

export const RETAIL_BRANCH_CONTEXT_KEY = 'retail-branch-context';

export const RetailBranchContext = (path: string) =>
  SetMetadata(RETAIL_BRANCH_CONTEXT_KEY, path);
