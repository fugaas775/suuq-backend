import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dataSource from '../src/data-source';

async function backfill(ds: DataSource) {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    // Reset all sales_count to 0
    await qr.query('UPDATE "product" SET sales_count = 0');

    // Sum quantities for delivered orders per product
    const updateSql = `
      UPDATE "product" p
      SET sales_count = agg.sum_qty
      FROM (
        SELECT oi."productId" as pid, COALESCE(SUM(oi.quantity), 0) as sum_qty
        FROM "order_item" oi
        INNER JOIN "order" o ON o.id = oi."orderId"
        WHERE o.status = 'DELIVERED'
        GROUP BY oi."productId"
      ) agg
      WHERE p.id = agg.pid
    `;
    await qr.query(updateSql);

    await qr.commitTransaction();
    const result = await ds.query('SELECT COUNT(1) as count FROM "product" WHERE sales_count > 0');
    const count = Array.isArray(result) ? (result[0]?.count ?? 0) : 0;
    console.log(`[backfill] Done. Products with sales_count > 0: ${count}`);
  } catch (e) {
    await qr.rollbackTransaction();
    console.error('[backfill] Failed:', e);
    process.exitCode = 1;
  } finally {
    await qr.release();
  }
}

(async () => {
  const ds = await dataSource.initialize();
  try {
    await backfill(ds);
  } finally {
    await ds.destroy();
  }
})();
