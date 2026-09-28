import 'dotenv/config';
import http from 'node:http';
import { applySchema, resetDatabase, schemaExists } from './db.js';
import { createApp } from './app.js';
import { createAdminApp } from './admin.js';
import { configure } from './runtime.js';

const PORT = Number(process.env.PORT || 4000);
const ADMIN_PORT = Number(process.env.ADMIN_PORT || 4001);
const ADMIN_HOST = process.env.ADMIN_HOST || '127.0.0.1';

if (!(await schemaExists())) {
  console.log('[playground] schema missing, creating it');
  await applySchema();
}
await resetDatabase();
configure({});

const server = http.createServer(createApp());
server.listen(PORT, () => console.log(`[playground] app    http://localhost:${PORT}`));

http.createServer(createAdminApp()).listen(ADMIN_PORT, ADMIN_HOST, () =>
  console.log(`[playground] admin  http://${ADMIN_HOST}:${ADMIN_PORT}  (reset / ground truth; not for the agent)`),
);
