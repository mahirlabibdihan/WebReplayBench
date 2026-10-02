import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DB_DIR = path.resolve(here, '..', 'db');

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  options: '-c search_path=app,meta',
});

/**
 * Run fn(client) in a transaction tagged with the request id and scenario, so
 * the audit trigger can attribute every row change to the request that made it.
 */
export async function withTx(ctx, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.request_id', $1, true), set_config('app.scenario', $2, true)",
      [ctx.id || '', ctx.scenario || ''],
    );
    const result = await fn(client);
    const { rows: [{ n }] } = await client.query('SELECT COUNT(*)::int AS n FROM meta.audit_log WHERE request_id = $1', [ctx.id || '']);
    await client.query('COMMIT');
    // Ground truth for the client: did this request change the database?
    if (ctx.res && !ctx.res.headersSent) {
      ctx.dbChanges = (ctx.dbChanges || 0) + n;
      ctx.res.setHeader('X-DB-Changes', String(ctx.dbChanges));
      ctx.res.setHeader('X-DB-Changed', ctx.dbChanges > 0 ? 'true' : 'false');
    }
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function query(text, params) {
  return pool.query(text, params);
}

export async function applySchema() {
  await pool.query(fs.readFileSync(path.join(DB_DIR, 'schema.sql'), 'utf8'));
}

/** Restore the seed state and clear all ground-truth logs. */
export async function resetDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      "SELECT string_agg(format('app.%I', tablename), ', ') AS t FROM pg_tables WHERE schemaname = 'app'",
    );
    await client.query(`TRUNCATE ${rows[0].t} RESTART IDENTITY CASCADE`);
    await client.query(fs.readFileSync(path.join(DB_DIR, 'seed.sql'), 'utf8'));
    await client.query('TRUNCATE meta.audit_log, meta.request_log RESTART IDENTITY');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function schemaExists() {
  const { rows } = await pool.query(
    "SELECT to_regclass('meta.audit_log') IS NOT NULL AS ok",
  );
  return rows[0].ok;
}
