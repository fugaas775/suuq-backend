#!/usr/bin/env node
// One-time script: set imageUrl for products that have no image
// Uses the same deterministic initials URL as the @AfterLoad hook

const { Client } = require('pg');

const API_BASE = (
  process.env.API_URL || 'https://api.suuq.ugasfuad.com'
).replace(/\/+$/, '');

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'suuqdb',
    user: 'suuquser',
    password: process.env.DB_PASSWORD || 'wDaUYUrxNKtII8hh',
  });

  await client.connect();

  const { rows } = await client.query(
    `SELECT id, name FROM product WHERE "imageUrl" IS NULL AND deleted_at IS NULL`,
  );

  console.log(`Found ${rows.length} products with no imageUrl`);

  let updated = 0;
  for (const row of rows) {
    const name = (row.name || 'PR').trim();
    const url = `${API_BASE}/api/img/initials?name=${encodeURIComponent(name)}`;
    await client.query(`UPDATE product SET "imageUrl" = $1 WHERE id = $2`, [
      url,
      row.id,
    ]);
    updated++;
    if (updated % 20 === 0)
      console.log(`  Updated ${updated}/${rows.length}...`);
  }

  console.log(`Done — updated ${updated} products.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
