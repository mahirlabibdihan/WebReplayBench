// Create the playground database (if missing), then (re)create its schemas and seed it.
import 'dotenv/config';
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL);
const dbName = url.pathname.slice(1);
const admin = new URL(url);
admin.pathname = '/postgres';

const c = new pg.Client({ connectionString: admin.toString() });
await c.connect();
const { rowCount } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (!rowCount) {
  await c.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  console.log(`created database ${dbName}`);
}
await c.end();

const { applySchema, resetDatabase, pool } = await import('../db.js');
await applySchema();
await resetDatabase();
await pool.end();
console.log(`schema applied and seeded: ${dbName}`);
