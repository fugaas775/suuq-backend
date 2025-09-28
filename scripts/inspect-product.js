require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const id = parseInt(process.argv[2] || '', 10);
  if (!id) {
    console.error('Usage: node scripts/inspect-product.js <productId>');
    process.exit(1);
  }
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const res = await client.query(
      `SELECT id, name, product_type, attributes FROM product WHERE id = $1`,
      [id]
    );
    if (!res.rows.length) {
      console.log('No product found with id', id);
      return;
    }
    const row = res.rows[0];
    console.log('Product', row.id, '-', row.name);
    console.log('product_type:', row.product_type);
    try {
      const attrs = row.attributes || {};
      console.log('attributes keys:', Object.keys(attrs));
      console.log('attributes JSON:', JSON.stringify(attrs, null, 2));
    } catch (e) {
      console.log('attributes (raw):', row.attributes);
    }
  } catch (e) {
    console.error('Error:', e);
    process.exitCode = 1;
  } finally {
    try { await client.end(); } catch {}
  }
}

main();
