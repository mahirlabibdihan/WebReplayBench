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
  ['Promo Deals', 'Weekend offer inside', 'Save on outdoor furniture this weekend.'],
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

/**
 * One controlled change by another actor, placed relative to a target message X
 * (the perturbation experiment: which changes should snapshot validation catch?).
 */
const PERTURBATIONS = {
  none: async () => {},
  // inside the target element: X's subject (the link name) changes
  target_label: (c, x) => c.query("UPDATE messages SET subject = subject || ' (edited)' WHERE id = $1", [x]),
  // X's row, outside the element: its date changes
  same_row: (c, x) => c.query("UPDATE messages SET sent_at = 'Just now' WHERE id = $1", [x]),
  // the neighboring row (the one above X, or below if X is first) is renamed
  neighbor_row: (c, x) => c.query(
    `UPDATE messages SET subject = subject || ' (edited)' WHERE id = COALESCE(
       (SELECT id FROM messages WHERE folder = 'inbox' AND sort_key > (SELECT sort_key FROM messages WHERE id = $1) ORDER BY sort_key LIMIT 1),
       (SELECT id FROM messages WHERE folder = 'inbox' AND sort_key < (SELECT sort_key FROM messages WHERE id = $1) ORDER BY sort_key DESC LIMIT 1))`,
    [x]),
  // a new message arrives: it is listed first, and every row moves down
  insert_top: (c) => c.query(
    `INSERT INTO messages (user_id, sender, subject, body, sent_at, sort_key)
     SELECT 1, 'Calendar', 'Reminder: team sync at 3 pm', 'Your team sync starts at 3 pm.', 'Just now', MAX(sort_key) + 1 FROM messages`),
  // an older message is added (e.g. imported): it is listed last, no row above it moves
  insert_bottom: (c) => c.query(
    `INSERT INTO messages (user_id, sender, subject, body, sent_at, sort_key, is_read)
     SELECT 1, 'Archive import', 'Old newsletter', 'Imported message.', 'Jul 1', MIN(sort_key) - 1, true FROM messages`),
  // X is archived on another device: its row disappears and the rows below move up
  remove_target: (c, x) => c.query("UPDATE messages SET folder = 'archive' WHERE id = $1", [x]),
  // far from X: the header's cart count changes (an item added on another device)
  remote_header: (c) => c.query(
    `INSERT INTO cart_items (user_id, product_id, qty)
     SELECT 1, id, 1 FROM products WHERE id NOT IN (SELECT product_id FROM cart_items WHERE user_id = 1) ORDER BY id LIMIT 1`),
};

export async function perturb(kind, messageId) {
  const fn = PERTURBATIONS[kind];
  if (!fn) throw Object.assign(new Error(`unknown perturbation ${kind}`), { status: 400 });
  await withTx(external, (c) => fn(c, messageId));
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
