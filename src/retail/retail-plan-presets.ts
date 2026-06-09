import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';
import { RetailModule } from './entities/tenant-module-entitlement.entity';

export type RetailPlanPresetModuleConfig = {
  module: RetailModule;
  enabled: boolean;
  reason: string;
  metadata?: Record<string, any> | null;
};

export type RetailPlanPreset = {
  code: string;
  name: string;
  description: string;
  billingInterval: TenantBillingInterval;
  amount: number;
  currency: string;
  defaultStatus: TenantSubscriptionStatus;
  maxProducts: number;
  modules: RetailPlanPresetModuleConfig[];
};

export const RETAIL_PLAN_PRESETS: RetailPlanPreset[] = [
  {
    code: 'POS_BRANCH_SUBSCRIPTION',
    name: 'POS branch subscription',
    description:
      'Single per-branch POS subscription. Owners pay 1,900 ETB monthly or 22,800 ETB for 1 year. No tier upgrades — every branch ships with POS Core, Inventory Core, replenishment automation, and analytics.',
    billingInterval: TenantBillingInterval.MONTHLY,
    amount: 1900,
    currency: 'ETB',
    defaultStatus: TenantSubscriptionStatus.ACTIVE,
    maxProducts: 10000,
    modules: [
      {
        module: RetailModule.POS_CORE,
        enabled: true,
        reason: 'Included in POS branch subscription',
        metadata: {
          includedBranches: 1,
          additionalBranchFee: 1900,
          additionalBranchCurrency: 'ETB',
        },
      },
      {
        module: RetailModule.INVENTORY_CORE,
        enabled: true,
        reason: 'Included in POS branch subscription',
      },
      {
        module: RetailModule.INVENTORY_AUTOMATION,
        enabled: true,
        reason: 'Included in POS branch subscription',
        metadata: {
          replenishmentPolicy: {
            submissionMode: 'AUTO_SUBMIT',
            minimumOrderTotal: 250,
            orderWindow: {
              daysOfWeek: [1, 3, 5],
              startHour: 8,
              endHour: 17,
              timeZone: 'Africa/Addis_Ababa',
            },
          },
        },
      },
      {
        module: RetailModule.AI_ANALYTICS,
        enabled: true,
        reason: 'Included in POS branch subscription',
        metadata: {
          aiAnalyticsPolicy: {
            stalePurchaseOrderHours: 72,
            targetHealthScore: 85,
          },
        },
      },
      {
        module: RetailModule.ACCOUNTING,
        enabled: true,
        reason: 'Included in POS branch subscription',
      },
    ],
  },
];

export function findRetailPlanPreset(
  code: string,
): RetailPlanPreset | undefined {
  return RETAIL_PLAN_PRESETS.find((preset) => preset.code === code);
}
