require('dotenv').config();
const { Client } = require('pg');

console.log('--- Database Connection Test ---');
console.log('Attempting to connect to database...');
console.log('Host:', process.env.DB_HOST);
console.log('User:', process.env.DB_USERNAME);
console.log('Database:', process.env.DB_NAME);

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false,
  },
});

client.connect()
  .then(() => {
    console.log('✅ SUCCESS: Connected to PostgreSQL successfully!');
    return client.query('SELECT NOW()');
  })
  .then(res => {
    console.log('Current time from DB:', res.rows[0].now);
    return client.end();
  })
  .catch(err => {
    console.error('❌ FAILED: Database connection error:', err.stack);
    process.exit(1);
  });
