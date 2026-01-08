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

    // Search for user
    const query = `
      SELECT email FROM "user" WHERE 'ADMIN' = ANY(roles) LIMIT 1
    `;

    const res = await client.query(query);

    if (res.rows.length === 0) {
      console.log('No admin user found');
    } else {
      console.log('Admin email:', res.rows[0].email);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
