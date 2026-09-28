// Reset to the seed state. Uses the admin API when the server is running (so
// its runtime knobs are reset too), otherwise talks to the database directly.
import 'dotenv/config';

const adminUrl = `http://${process.env.ADMIN_HOST || '127.0.0.1'}:${process.env.ADMIN_PORT || 4001}`;
try {
  const r = await fetch(`${adminUrl}/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  console.log('reset via admin API:', (await r.json()).ok);
} catch {
  const { resetDatabase, pool } = await import('../db.js');
  await resetDatabase();
  await pool.end();
  console.log('reset directly in the database (server not running)');
}
