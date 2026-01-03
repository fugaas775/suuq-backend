require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    console.log('Connected to DB');

    // Fetch last 10 products
    const res = await client.query(
      `SELECT id, name, status, "isBlocked", "createdAt" FROM product ORDER BY id DESC LIMIT 10`,
    );

    console.log('Last 10 products:');
    console.table(res.rows);

    // Test filter query
    console.log('\nTesting filter query (status=publish AND isBlocked=false):');
    const resFilter = await client.query(
      `SELECT id, name, status, "isBlocked" FROM product WHERE status = 'publish' AND "isBlocked" = false ORDER BY id DESC LIMIT 10`,
    );
    console.table(resFilter.rows);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

main();
