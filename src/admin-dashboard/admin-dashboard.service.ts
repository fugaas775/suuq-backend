async getAnalytics({ from, to }: { from?: string; to?: string }) {
  // Date filter for analytics
  const dateFilter = from && to ? {
    createdAt: Between(new Date(from), new Date(to + 'T23:59:59')),
  } : {};

  // Example: daily new users and orders in the selected range
  // You can expand this as needed for more/different analytics

  // Users registered per day
  const usersPerDay = await this.userRepo
    .createQueryBuilder('user')
    .select([
      `DATE_TRUNC('day', user.createdAt) as date`,
      'COUNT(*)::int as count'
    ])
    .where(dateFilter as any)
    .groupBy(`date`)
    .orderBy(`date`, 'ASC')
    .getRawMany();

  // Orders placed per day
  const ordersPerDay = await this.orderRepo
    .createQueryBuilder('order')
    .select([
      `DATE_TRUNC('day', order.createdAt) as date`,
      'COUNT(*)::int as count'
    ])
    .where(dateFilter as any)
    .groupBy(`date`)
    .orderBy(`date`, 'ASC')
    .getRawMany();

  // Total revenue in the period
  const revenueResult = await this.orderRepo
    .createQueryBuilder('order')
    .leftJoin('order.product', 'product')
    .where(dateFilter as any)
    .select('SUM(order.quantity * product.price)', 'revenue')
    .getRawOne();

  // Total withdrawals in the period
  const withdrawalResult = await this.withdrawalRepo
    .createQueryBuilder('w')
    .where('w.status = :status', { status: 'APPROVED' })
    .andWhere(dateFilter.createdAt ? 'w."createdAt" BETWEEN :from AND :to' : '1=1', {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to + 'T23:59:59') : undefined,
    })
    .select('SUM(w.amount)', 'total')
    .getRawOne();

  return {
    usersPerDay,
    ordersPerDay,
    totalRevenue: Number(revenueResult?.revenue || 0),
    totalWithdrawals: Number(withdrawalResult?.total || 0),
  };
}
