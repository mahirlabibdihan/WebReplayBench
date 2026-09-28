import { withTx } from './db.js';

/**
 * Per-task runtime knobs, set through the admin API on every reset.
 *   dynamic:  randomize "Trending now" order and "Deal of the moment" (H3)
 *   external: background activity by another actor (H4), e.g.
 *             { inbox_drip_s: 40, stock_drift_s: 30 }
 */
export const runtime = {
  dynamic: true,
  external: null,
};

const timers = [];
let dripCount = 0;

const DRIP_MESSAGES = [
  ['Calendar', 'Reminder: team sync at 3 pm', 'Your team sync starts at 3 pm in Room 4.'],
  ['Promo Deals', 'Weekend offer inside', 'Save on outdoor gear this weekend.'],
  ['Sam Chen', 'Re: Lunch on Friday?', 'Works for me, see you then.'],
  ['IT Support', 'Scheduled maintenance', 'Email may be slow tonight between 1 and 2 am.'],
  ['Alex Rivera', 'Dinner plans', 'Thai or pizza tonight?'],
];

const external = { id: 'external', scenario: 'H4' };

async function dripMessage() {
  const [sender, subject, body] = DRIP_MESSAGES[dripCount % DRIP_MESSAGES.length];
  dripCount += 1;
  await withTx(external, (c) =>
    c.query(
      `INSERT INTO messages (user_id, sender, subject, body, sent_at, sort_key)
       SELECT 1, $1, $2, $3, 'Just now', COALESCE(MAX(sort_key), 0) + 1 FROM messages`,
      [sender, subject, body],
    ),
  );
}

async function driftStock() {
  await withTx(external, (c) =>
    c.query('UPDATE products SET stock = GREATEST(stock - 1, 0) WHERE id = (SELECT id FROM products ORDER BY random() LIMIT 1)'),
  );
}

export function stopExternal() {
  while (timers.length) clearInterval(timers.pop());
  dripCount = 0;
}

export function configure({ dynamic = true, external: ext = null } = {}) {
  stopExternal();
  runtime.dynamic = dynamic;
  runtime.external = ext;
  const safe = (fn) => () => fn().catch((err) => console.error('[external]', err.message));
  if (ext?.inbox_drip_s) timers.push(setInterval(safe(dripMessage), ext.inbox_drip_s * 1000));
  if (ext?.stock_drift_s) timers.push(setInterval(safe(driftStock), ext.stock_drift_s * 1000));
}
