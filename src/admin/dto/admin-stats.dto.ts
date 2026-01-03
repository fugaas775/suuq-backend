export class AdminStatsDto {
  totalUsers: number;
  totalVendors: number;
  totalCustomers: number;
  totalAdmins: number;
  totalRevenue: number;
  totalOrders: number;
  fxSource?: string;
  fxUpdatedAt?: string;
  fxLastFetchAt?: string | null;
}
