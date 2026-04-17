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
  modules: RetailPlanPresetModuleConfig[];
};

export const RETAIL_PLAN_PRESETS: RetailPlanPreset[] = [
  {
    code: 'RETAIL_STARTER',
    name: 'Retail Starter',
    description:
      'Core branch POS and inventory visibility for single-store operators.',
    billingInterval: TenantBillingInterval.MONTHLY,
    amount: 1900,
    currency: 'ETB',
    defaultStatus: TenantSubscriptionStatus.ACTIVE,
    modules: [
      {
        module: RetailModule.POS_CORE,
        enabled: true,
        reason: 'Included in Retail Starter preset',
        metadata: {
          includedBranches: 1,
          additionalBranchFee: 1300,
          additionalBranchCurrency: 'ETB',
        },
      },
      {
        module: RetailModule.INVENTORY_CORE,
        enabled: true,
        reason: 'Included in Retail Starter preset',
      },
    ],
  },
  {
    code: 'RETAIL_AUTOMATION',
    name: 'Retail Automation',
    description:
      'Adds replenishment automation to the core branch operating stack.',
    billingInterval: TenantBillingInterval.MONTHLY,
    amount: 179,
    currency: 'USD',
    defaultStatus: TenantSubscriptionStatus.ACTIVE,
    modules: [
      {
        module: RetailModule.POS_CORE,
        enabled: true,
        reason: 'Included in Retail Automation preset',
      },
      {
        module: RetailModule.INVENTORY_CORE,
        enabled: true,
        reason: 'Included in Retail Automation preset',
      },
      {
        module: RetailModule.INVENTORY_AUTOMATION,
        enabled: true,
        reason: 'Included in Retail Automation preset',
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
    ],
  },
  {
    code: 'RETAIL_INTELLIGENCE',
    name: 'Retail Intelligence',
    description:
      'Automation plus AI analytics for operators that want prioritized decision support.',
    billingInterval: TenantBillingInterval.MONTHLY,
    amount: 249,
    currency: 'USD',
    defaultStatus: TenantSubscriptionStatus.ACTIVE,
    modules: [
      {
        module: RetailModule.POS_CORE,
        enabled: true,
        reason: 'Included in Retail Intelligence preset',
      },
      {
        module: RetailModule.INVENTORY_CORE,
        enabled: true,
        reason: 'Included in Retail Intelligence preset',
      },
      {
        module: RetailModule.INVENTORY_AUTOMATION,
        enabled: true,
        reason: 'Included in Retail Intelligence preset',
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
        reason: 'Included in Retail Intelligence preset',
        metadata: {
          aiAnalyticsPolicy: {
            stalePurchaseOrderHours: 72,
            targetHealthScore: 85,
          },
        },
      },
    ],
  },
  {
    code: 'RETAIL_ENTERPRISE',
    name: 'Retail Enterprise',
    description:
      'Intelligence plus branch accounting workflows for larger multi-branch operators.',
    billingInterval: TenantBillingInterval.MONTHLY,
    amount: 349,
    currency: 'USD',
    defaultStatus: TenantSubscriptionStatus.ACTIVE,
    modules: [
      {
        module: RetailModule.POS_CORE,
        enabled: true,
        reason: 'Included in Retail Enterprise preset',
      },
      {
        module: RetailModule.INVENTORY_CORE,
        enabled: true,
        reason: 'Included in Retail Enterprise preset',
      },
      {
        module: RetailModule.INVENTORY_AUTOMATION,
        enabled: true,
        reason: 'Included in Retail Enterprise preset',
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
        reason: 'Included in Retail Enterprise preset',
        metadata: {
          aiAnalyticsPolicy: {
            stalePurchaseOrderHours: 48,
            targetHealthScore: 90,
          },
        },
      },
      {
        module: RetailModule.ACCOUNTING,
        enabled: true,
        reason: 'Included in Retail Enterprise preset',
      },
    ],
  },
];

export function findRetailPlanPreset(
  code: string,
): RetailPlanPreset | undefined {
  return RETAIL_PLAN_PRESETS.find((preset) => preset.code === code);
}
