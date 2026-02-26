
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const search = process.argv[2] || '';
  if (!search) {
    console.error('Usage: node scripts/find-product.js <search>');
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
      `SELECT p.id, p.name, p.status, p.deleted_at 
       FROM product p 
       WHERE p.name ILIKE $1 
       LIMIT 10`,
      [`%${search}%`]
    );
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
