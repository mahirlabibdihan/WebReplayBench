import express from 'express';
import { pool, query, resetDatabase } from './db.js';
import { configure, runtime, stopExternal } from './runtime.js';

async function watermark() {
  const { rows: [w] } = await query(
    `SELECT (SELECT COALESCE(MAX(id), 0) FROM meta.audit_log)::bigint AS audit,
            (SELECT COALESCE(MAX(id), 0) FROM meta.request_log)::bigint AS request`,
  );
  return { audit: Number(w.audit), request: Number(w.request) };
}

/**
 * Admin / oracle API. Never exposed to the agent: it listens on its own port,
 * which an agent restricted to the app's host:port is never allowed to visit.
 */
export function createAdminApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const handle = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  };

  app.get('/health', handle(async () => ({ ok: true, runtime })));

  // Restore the seed state. Body: { dynamic?: bool, external?: {inbox_drip_s, stock_drift_s} }
  app.post('/reset', handle(async (req) => {
    stopExternal();
    await resetDatabase();
    configure(req.body || {});
    return { ok: true, runtime, watermark: await watermark() };
  }));

  app.post('/external', handle(async (req) => {
    configure({ dynamic: runtime.dynamic, external: req.body || null });
    return { ok: true, runtime };
  }));

  app.get('/watermark', handle(watermark));

  app.get('/audit', handle(async (req) => {
    const after = Number(req.query.after || 0);
    const upto = req.query.upto ? Number(req.query.upto) : Number.MAX_SAFE_INTEGER;
    const { rows } = await query('SELECT * FROM meta.audit_log WHERE id > $1 AND id <= $2 ORDER BY id', [after, upto]);
    return { rows };
  }));

  app.get('/requests', handle(async (req) => {
    const after = Number(req.query.after || 0);
    const upto = req.query.upto ? Number(req.query.upto) : Number.MAX_SAFE_INTEGER;
    const { rows } = await query('SELECT * FROM meta.request_log WHERE id > $1 AND id <= $2 ORDER BY id', [after, upto]);
    return { rows };
  }));

  // Content hash of every app table (sessions excluded: tokens are random).
  app.get('/fingerprint', handle(async () => {
    const { rows: tables } = await query("SELECT tablename FROM pg_tables WHERE schemaname = 'app' AND tablename <> 'sessions' ORDER BY tablename");
    const out = {};
    for (const { tablename } of tables) {
      const { rows: [r] } = await query(
        `SELECT md5(COALESCE(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM app.${tablename} t`,
      );
      out[tablename] = r.h;
    }
    return { tables: out };
  }));

  // Read-only SQL for task evaluation.
  app.post('/query', handle(async (req) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const { rows } = await client.query(req.body.sql, req.body.params || []);
      await client.query('ROLLBACK');
      return { rows };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      err.status = 400;
      throw err;
    } finally {
      client.release();
    }
  }));

  return app;
}
