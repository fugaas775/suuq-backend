export class AdminStatsDto {
  totalUsers: number;
  totalVendors: number;
  totalCustomers: number;
  totalAdmins: number;
  totalRevenue: number;
  totalOrders: number;
  currency?: string;
  fxSource?: string;
  fxUpdatedAt?: string;
  fxLastFetchAt?: string | null;
}
