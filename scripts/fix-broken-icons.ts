import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const dbConfig = {
    host:  process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME || 'suuquser',
    password: process.env.DB_PASSWORD || 'wDaUYUrxNKtII8hh',
    database: process.env.DB_DATABASE || 'suuqdb',
};

async function fixIcons() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log('DB Connected');

    try {
        const query = `
            UPDATE category 
            SET "iconUrl" = NULL 
            WHERE "iconUrl" IS NOT NULL 
            AND "iconName" IS NOT NULL
        `;
        const res = await client.query(query);
        console.log(`Updated ${res.rowCount} categories.`);
    } catch (err) {
        console.error('Error executing update:', err);
    } finally {
        await client.end();
    }
}

fixIcons();
