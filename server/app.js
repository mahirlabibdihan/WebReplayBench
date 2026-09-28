import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { query, withTx } from './db.js';
import { runtime } from './runtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(here, '..', 'client', 'dist');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SHIPPING_CENTS = { standard: 499, express: 1499 };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Wrap an async handler; `scenario` is the default ground-truth tag for the route. */
const route = (scenario, fn) => async (req, res, next) => {
  req.scenario = req.get('x-scenario') || scenario;
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

async function userFromSid(sid) {
  if (!sid) return null;
  const { rows } = await query(
    'SELECT u.id, u.username, u.full_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1',
    [sid],
  );
  return rows[0] || null;
}

function logRequest({ requestId, method, path: p, status, scenario }) {
  return query(
    'INSERT INTO meta.request_log (request_id, method, path, status, scenario) VALUES ($1, $2, $3, $4, $5)',
    [requestId, method, p, status, scenario],
  ).catch((err) => console.error('[request_log]', err.message));
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // Ground truth: every request gets an id and a request_log row.
  app.use((req, res, next) => {
    req.id = crypto.randomUUID();
    req.scenario = null;
    // Overwritten by withTx() when the request commits row changes.
    res.setHeader('X-DB-Changed', 'false');
    res.setHeader('X-DB-Changes', '0');
    res.setHeader('X-Request-Id', req.id);
    const isAsset = req.path.startsWith('/assets/') || req.path === '/favicon.svg';
    res.on('finish', () => {
      if (isAsset) return;
      logRequest({ requestId: req.id, method: req.method, path: req.originalUrl, status: res.statusCode, scenario: req.scenario });
    });
    next();
  });

  app.use(async (req, res, next) => {
    try {
      req.user = await userFromSid(req.cookies.sid);
      next();
    } catch (err) {
      next(err);
    }
  });

  const api = express.Router();

  // ------------------------------------------------------------------ auth
  api.post('/login', route('LOGIN', async (req, res) => {
    const { username, password } = req.body || {};
    const { rows } = await query('SELECT id FROM users WHERE username = $1 AND password_hash = $2', [username, sha256(password || '')]);
    if (!rows[0]) throw new HttpError(401, 'Invalid username or password.');
    const token = crypto.randomBytes(24).toString('hex');
    await withTx(req, (c) => c.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, rows[0].id]));
    res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json({ ok: true });
  }));

  api.use((req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Not signed in.' })));

  api.post('/logout', route('T6', async (req, res) => {
    await withTx(req, (c) => c.query('DELETE FROM sessions WHERE token = $1', [req.cookies.sid]));
    res.clearCookie('sid', { path: '/' });
    res.json({ ok: true });
  }));

  api.get('/me', route(null, async (req, res) => res.json(req.user)));

  api.get('/summary', route(null, async (req, res) => {
    const uid = req.user.id;
    const { rows } = await query(
      `SELECT
         (SELECT COALESCE(SUM(qty), 0)::int FROM cart_items WHERE user_id = $1) AS cart,
         (SELECT COUNT(*)::int FROM wishlist WHERE user_id = $1) AS wishlist,
         (SELECT COUNT(*)::int FROM messages WHERE user_id = $1 AND folder = 'inbox' AND NOT is_read) AS unread`,
      [uid],
    );
    res.json(rows[0]);
  }));

  // ------------------------------------------------------------------ home
  api.get('/home', route(null, async (req, res) => {
    const uid = req.user.id;
    const recent = await query(
      `SELECT p.id, p.name FROM recently_viewed r JOIN products p ON p.id = r.product_id
       WHERE r.user_id = $1 ORDER BY r.viewed_seq DESC LIMIT 4`,
      [uid],
    );
    const trending = await query(
      runtime.dynamic
        ? 'SELECT id, name, price_cents FROM products ORDER BY random() LIMIT 5'
        : 'SELECT id, name, price_cents FROM products WHERE id IN (9, 3, 16, 8, 13) ORDER BY id',
    );
    const deal = await query(
      runtime.dynamic
        ? 'SELECT id, name, price_cents FROM products ORDER BY random() LIMIT 1'
        : 'SELECT id, name, price_cents FROM products WHERE id = 12',
    );
    res.json({
      announcement: { id: 'sept-maintenance', text: 'Scheduled maintenance on Sunday 2-3 am. Orders placed then may be delayed.' },
      recentlyViewed: recent.rows,
      trending: trending.rows,
      deal: deal.rows[0],
    });
  }));

  // -------------------------------------------------------------- products
  const productFields = `p.id, p.name, p.category, p.price_cents, p.stock,
    EXISTS (SELECT 1 FROM wishlist w WHERE w.user_id = $1 AND w.product_id = p.id) AS wishlisted`;

  api.get('/products', route(null, async (req, res) => {
    const uid = req.user.id;
    const q = (req.query.q || '').trim();
    const sort = { 'price-asc': 'p.price_cents ASC', 'price-desc': 'p.price_cents DESC', name: 'p.name ASC' }[req.query.sort] || 'p.id ASC';
    const { rows: [s] } = await query('SELECT items_per_page FROM settings WHERE user_id = $1', [uid]);
    const perPage = s.items_per_page;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const params = q ? [uid, `%${q}%`] : [uid];
    const { rows: [{ n: total }] } = await query(
      `SELECT COUNT(*)::int AS n FROM products p ${q ? 'WHERE p.name ILIKE $1' : ''}`,
      q ? [`%${q}%`] : [],
    );
    const items = await query(
      `SELECT ${productFields} FROM products p ${q ? 'WHERE p.name ILIKE $2' : ''} ORDER BY ${sort}
       LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
      params,
    );
    const cats = await query('SELECT DISTINCT category FROM products ORDER BY category');
    res.json({ items: items.rows, page, pages: Math.max(1, Math.ceil(total / perPage)), total, categories: cats.rows.map((r) => r.category) });
  }));

  // Read-only POST: a "search API" that happens to use POST (Q1).
  api.post('/products/filter', route('Q1', async (req, res) => {
    const { q = '', minPrice, maxPrice, inStock } = req.body || {};
    const conds = ['p.name ILIKE $2'];
    const params = [req.user.id, `%${q}%`];
    if (minPrice !== '' && minPrice != null) { params.push(Math.round(Number(minPrice) * 100)); conds.push(`p.price_cents >= $${params.length}`); }
    if (maxPrice !== '' && maxPrice != null) { params.push(Math.round(Number(maxPrice) * 100)); conds.push(`p.price_cents <= $${params.length}`); }
    if (inStock) conds.push('p.stock > 0');
    const { rows } = await query(`SELECT ${productFields} FROM products p WHERE ${conds.join(' AND ')} ORDER BY p.id`, params);
    res.json({ items: rows });
  }));

  // Viewing a product silently records it as recently viewed (N4).
  api.get('/products/:id', route('N4', async (req, res) => {
    const uid = req.user.id;
    const id = Number(req.params.id);
    const { rows: [product] } = await query(`SELECT ${productFields}, p.description, p.specs FROM products p WHERE p.id = $2`, [uid, id]);
    if (!product) throw new HttpError(404, 'Product not found.');
    await withTx(req, (c) => c.query(
      `INSERT INTO recently_viewed (user_id, product_id) VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO UPDATE SET viewed_seq = nextval('app.recently_viewed_viewed_seq_seq')`,
      [uid, id],
    ));
    const reviews = await query('SELECT id, author, stars, body FROM reviews WHERE product_id = $1 ORDER BY id LIMIT 3', [id]);
    const count = await query('SELECT COUNT(*)::int AS n FROM reviews WHERE product_id = $1', [id]);
    const rating = await query('SELECT stars FROM ratings WHERE user_id = $1 AND product_id = $2', [uid, id]);
    res.json({ ...product, reviews: reviews.rows, reviewCount: count.rows[0].n, myRating: rating.rows[0]?.stars || null });
  }));

  api.get('/products/:id/reviews', route('P3', async (req, res) => {
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const { rows } = await query('SELECT id, author, stars, body FROM reviews WHERE product_id = $1 ORDER BY id OFFSET $2 LIMIT 3', [req.params.id, offset]);
    res.json({ reviews: rows });
  }));

  api.get('/products/:id/delivery', route('P4', async (req, res) => {
    const zip = String(req.query.zip || '').trim();
    if (!/^\d{5}$/.test(zip)) throw new HttpError(400, 'Enter a 5-digit ZIP code.');
    res.json({ estimate: Number(zip[0]) < 5 ? 'Arrives in 2-3 business days' : 'Arrives in 4-6 business days' });
  }));

  // A POST fired by a radio button, not a button element (N11).
  api.post('/products/:id/rating', route('N11', async (req, res) => {
    const stars = Number(req.body?.stars);
    if (!(stars >= 1 && stars <= 5)) throw new HttpError(400, 'Invalid rating.');
    await withTx(req, (c) => c.query(
      `INSERT INTO ratings (user_id, product_id, stars) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id) DO UPDATE SET stars = EXCLUDED.stars`,
      [req.user.id, req.params.id, stars],
    ));
    res.json({ stars });
  }));

  // -------------------------------------------------------------- wishlist
  api.get('/wishlist', route(null, async (req, res) => {
    const { rows } = await query(
      'SELECT p.id, p.name, p.price_cents FROM wishlist w JOIN products p ON p.id = w.product_id WHERE w.user_id = $1 ORDER BY p.name',
      [req.user.id],
    );
    res.json({ items: rows });
  }));

  api.delete('/wishlist/:productId', route('T2', async (req, res) => {
    await withTx(req, (c) => c.query('DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId]));
    res.json({ ok: true });
  }));

  // ------------------------------------------------------------------ cart
  const cartSummary = async (uid) => {
    const { rows } = await query(
      `SELECT c.id, c.qty, p.id AS product_id, p.name, p.price_cents, p.stock
       FROM cart_items c JOIN products p ON p.id = c.product_id WHERE c.user_id = $1 ORDER BY c.id`,
      [uid],
    );
    return { items: rows, subtotal_cents: rows.reduce((s, r) => s + r.qty * r.price_cents, 0) };
  };

  api.get('/cart', route(null, async (req, res) => res.json(await cartSummary(req.user.id))));

  const addToCart = (req, productId, qty) => withTx(req, (c) => c.query(
    `INSERT INTO cart_items (user_id, product_id, qty) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET qty = cart_items.qty + EXCLUDED.qty`,
    [req.user.id, productId, qty],
  ));

  api.post('/cart', route('T1', async (req, res) => {
    const qty = Math.max(1, Math.min(10, parseInt(req.body?.qty, 10) || 1));
    await addToCart(req, Number(req.body?.productId), qty);
    res.json(await cartSummary(req.user.id));
  }));

  // Non-idempotent GET (N7): every call adds one more.
  api.get('/cart/quick-add/:productId', route('N7', async (req, res) => {
    await addToCart(req, Number(req.params.productId), 1);
    res.json(await cartSummary(req.user.id));
  }));

  api.patch('/cart/:itemId', route('R2', async (req, res) => {
    const qty = Math.max(1, Math.min(10, parseInt(req.body?.qty, 10) || 1));
    await withTx(req, (c) => c.query('UPDATE cart_items SET qty = $1 WHERE id = $2 AND user_id = $3', [qty, req.params.itemId, req.user.id]));
    res.json(await cartSummary(req.user.id));
  }));

  api.delete('/cart/:itemId', route('T2', async (req, res) => {
    await withTx(req, (c) => c.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [req.params.itemId, req.user.id]));
    res.json(await cartSummary(req.user.id));
  }));

  // -------------------------------------------------------------- checkout
  const claimedCoupon = async (uid, code) => {
    const { rows } = await query(
      'SELECT c.code, c.percent_off FROM coupons c JOIN coupon_claims k ON k.code = c.code WHERE k.user_id = $1 AND upper(c.code) = upper($2)',
      [uid, code || ''],
    );
    return rows[0] || null;
  };

  api.get('/checkout', route(null, async (req, res) => {
    const addresses = await query('SELECT id, label, line, is_default FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, id', [req.user.id]);
    res.json({ addresses: addresses.rows, cart: await cartSummary(req.user.id), shipping: SHIPPING_CENTS });
  }));

  // Read-only POST (Q3).
  api.post('/coupons/validate', route('Q3', async (req, res) => {
    const coupon = await claimedCoupon(req.user.id, req.body?.code);
    if (!coupon) throw new HttpError(404, 'That coupon is not available on your account. Claim it on the Offers page first.');
    res.json(coupon);
  }));

  api.post('/orders', route('T3', async (req, res) => {
    const uid = req.user.id;
    const { addressId, shipping, couponCode, acceptTerms } = req.body || {};
    const cart = await cartSummary(uid);
    const invalid = !acceptTerms ? 'You must accept the terms of sale.' : !cart.items.length ? 'Your cart is empty.' : !SHIPPING_CENTS[shipping] ? 'Choose a shipping method.' : null;
    if (invalid) {
      req.scenario = 'Q6';
      throw new HttpError(422, invalid);
    }
    const coupon = couponCode ? await claimedCoupon(uid, couponCode) : null;
    const total = Math.round(cart.subtotal_cents * (1 - (coupon?.percent_off || 0) / 100)) + SHIPPING_CENTS[shipping];
    const orderId = await withTx(req, async (c) => {
      const addr = await c.query('SELECT id FROM addresses WHERE id = $1 AND user_id = $2', [addressId, uid]);
      if (!addr.rows[0]) throw new HttpError(422, 'Choose a delivery address.');
      const { rows: [o] } = await c.query(
        `INSERT INTO orders (user_id, address_id, shipping, coupon_code, total_cents, placed_at)
         VALUES ($1, $2, $3, $4, $5, '2026-09-28') RETURNING id`,
        [uid, addressId, shipping, coupon?.code || null, total],
      );
      for (const it of cart.items) {
        await c.query('INSERT INTO order_items (order_id, product_id, qty, price_cents) VALUES ($1, $2, $3, $4)', [o.id, it.product_id, it.qty, it.price_cents]);
        await c.query('UPDATE products SET stock = GREATEST(stock - $1, 0) WHERE id = $2', [it.qty, it.product_id]);
      }
      await c.query('DELETE FROM cart_items WHERE user_id = $1', [uid]);
      return o.id;
    });
    res.json({ orderId });
  }));

  const orderDetails = async (uid, where = '', params = []) => {
    const { rows } = await query(
      `SELECT o.id, o.shipping, o.coupon_code, o.total_cents, o.placed_at, a.line AS address,
         json_agg(json_build_object('name', p.name, 'qty', i.qty, 'price_cents', i.price_cents) ORDER BY i.id) AS items
       FROM orders o JOIN addresses a ON a.id = o.address_id
       JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id
       WHERE o.user_id = $1 ${where} GROUP BY o.id, a.line ORDER BY o.id DESC`,
      [uid, ...params],
    );
    return rows;
  };

  api.get('/orders', route(null, async (req, res) => res.json({ orders: await orderDetails(req.user.id) })));
  api.get('/orders/:id', route(null, async (req, res) => {
    const [order] = await orderDetails(req.user.id, 'AND o.id = $2', [req.params.id]);
    if (!order) throw new HttpError(404, 'Order not found.');
    res.json(order);
  }));

  // ---------------------------------------------------------------- offers
  api.get('/offers', route(null, async (req, res) => {
    const { rows } = await query(
      `SELECT c.code, c.description, c.percent_off,
         EXISTS (SELECT 1 FROM coupon_claims k WHERE k.user_id = $1 AND k.code = c.code) AS claimed
       FROM coupons c ORDER BY c.code`,
      [req.user.id],
    );
    res.json({ coupons: rows });
  }));

  // One-time GET (N6): a second call fails.
  api.get('/coupons/claim', route('N6', async (req, res) => {
    const code = String(req.query.code || '');
    const exists = await query('SELECT 1 FROM coupons WHERE code = $1', [code]);
    if (!exists.rows[0]) throw new HttpError(404, 'Unknown coupon.');
    const r = await withTx(req, (c) => c.query('INSERT INTO coupon_claims (user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, code]));
    if (r.rowCount === 0) throw new HttpError(409, `Coupon ${code} was already claimed.`);
    res.json({ ok: true, code });
  }));

  // -------------------------------------------------------------- messages
  api.get('/messages', route(null, async (req, res) => {
    const folder = req.query.folder === 'archive' ? 'archive' : 'inbox';
    const { rows } = await query(
      'SELECT id, sender, subject, sent_at, is_read, is_starred FROM messages WHERE user_id = $1 AND folder = $2 ORDER BY sort_key DESC',
      [req.user.id, folder],
    );
    res.json({ folder, messages: rows });
  }));

  // A button whose GET marks everything read (N16).
  api.get('/messages/mark-all-read', route('N16', async (req, res) => {
    const r = await withTx(req, (c) => c.query("UPDATE messages SET is_read = true WHERE user_id = $1 AND folder = 'inbox' AND NOT is_read", [req.user.id]));
    res.json({ updated: r.rowCount });
  }));

  // Opening a message marks it read (N3).
  api.get('/messages/:id', route('N3', async (req, res) => {
    const uid = req.user.id;
    const id = Number(req.params.id);
    await withTx(req, (c) => c.query('UPDATE messages SET is_read = true WHERE id = $1 AND user_id = $2', [id, uid]));
    const { rows: [m] } = await query('SELECT id, sender, subject, body, sent_at, is_read, is_starred, folder FROM messages WHERE id = $1 AND user_id = $2', [id, uid]);
    if (!m) throw new HttpError(404, 'Message not found.');
    const replies = await query('SELECT id, body FROM replies WHERE message_id = $1 ORDER BY id', [id]);
    const draft = await query('SELECT body FROM drafts WHERE user_id = $1 AND message_id = $2', [uid, id]);
    const unsubscribe = m.sender === 'Weekly Picks' ? { list: 'weekly-picks', title: 'Weekly Picks' } : null;
    res.json({ ...m, replies: replies.rows, draft: draft.rows[0]?.body || '', unsubscribe });
  }));

  // Toggle via GET (N2): replaying it undoes it.
  api.get('/messages/:id/toggle-star', route('N2', async (req, res) => {
    const { rows } = await withTx(req, (c) => c.query(
      'UPDATE messages SET is_starred = NOT is_starred WHERE id = $1 AND user_id = $2 RETURNING is_starred',
      [req.params.id, req.user.id],
    ));
    if (!rows[0]) throw new HttpError(404, 'Message not found.');
    res.json({ is_starred: rows[0].is_starred });
  }));

  api.post('/messages/:id/archive', route('N10', async (req, res) => {
    await withTx(req, (c) => c.query("UPDATE messages SET folder = 'archive' WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]));
    res.json({ ok: true });
  }));

  api.patch('/messages/:id', route('R6', async (req, res) => {
    await withTx(req, (c) => c.query('UPDATE messages SET is_read = $1 WHERE id = $2 AND user_id = $3', [Boolean(req.body?.is_read), req.params.id, req.user.id]));
    res.json({ ok: true });
  }));

  api.delete('/messages/:id', route('T7', async (req, res) => {
    await withTx(req, (c) => c.query('DELETE FROM messages WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]));
    res.json({ ok: true });
  }));

  api.post('/messages/:id/reply', route('T8', async (req, res) => {
    const body = String(req.body?.body || '').trim();
    if (!body) throw new HttpError(422, 'Reply cannot be empty.');
    await withTx(req, async (c) => {
      await c.query('INSERT INTO replies (message_id, body) SELECT id, $2 FROM messages WHERE id = $1 AND user_id = $3', [req.params.id, body, req.user.id]);
      await c.query('DELETE FROM drafts WHERE user_id = $1 AND message_id = $2', [req.user.id, req.params.id]);
    });
    res.json({ ok: true });
  }));

  // Draft autosave through a GET with the text in the query string (N8).
  api.get('/drafts/save', route('N8', async (req, res) => {
    await withTx(req, (c) => c.query(
      `INSERT INTO drafts (user_id, message_id, body) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, message_id) DO UPDATE SET body = EXCLUDED.body`,
      [req.user.id, Number(req.query.message), String(req.query.body || '')],
    ));
    res.json({ saved: true });
  }));

  // DELETE that writes only when a draft exists (T12), otherwise a no-op (Q7).
  api.delete('/drafts/:messageId', route('T12', async (req, res) => {
    const r = await withTx(req, (c) => c.query('DELETE FROM drafts WHERE user_id = $1 AND message_id = $2', [req.user.id, req.params.messageId]));
    if (r.rowCount === 0) req.scenario = 'Q7';
    res.json({ deleted: r.rowCount });
  }));

  // Read-only POST (Q2).
  api.post('/preview', route('Q2', async (req, res) => {
    const escaped = String(req.body?.markdown || '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
    res.json({ html: escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>') });
  }));

  // ----------------------------------------------------------------- notes
  api.get('/notes', route(null, async (req, res) => {
    const { rows } = await query('SELECT body FROM notes WHERE user_id = $1', [req.user.id]);
    res.json({ body: rows[0]?.body || '' });
  }));

  api.patch('/notes', route('R3', async (req, res) => {
    await withTx(req, (c) => c.query('UPDATE notes SET body = $1 WHERE user_id = $2', [String(req.body?.body ?? ''), req.user.id]));
    res.json({ saved: true });
  }));

  // ----------------------------------------------------------------- todos
  const todoList = async (uid) => (await query('SELECT id, title, done FROM todos WHERE user_id = $1 ORDER BY id', [uid])).rows;

  // Read-only reload behind a button (P9).
  api.get('/todos', route(null, async (req, res) => res.json({ todos: await todoList(req.user.id) })));

  api.post('/todos', route('T9', async (req, res) => {
    const title = String(req.body?.title || '').trim();
    if (!title) throw new HttpError(422, 'Title is required.');
    await withTx(req, (c) => c.query('INSERT INTO todos (user_id, title) VALUES ($1, $2)', [req.user.id, title]));
    res.json({ todos: await todoList(req.user.id) });
  }));

  // Checkbox that saves immediately through PATCH (R7).
  api.patch('/todos/:id', route('R7', async (req, res) => {
    await withTx(req, (c) => c.query('UPDATE todos SET done = $1 WHERE id = $2 AND user_id = $3', [Boolean(req.body?.done), req.params.id, req.user.id]));
    res.json({ todos: await todoList(req.user.id) });
  }));

  api.delete('/todos/:id', route('T10', async (req, res) => {
    await withTx(req, (c) => c.query('DELETE FROM todos WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]));
    res.json({ todos: await todoList(req.user.id) });
  }));

  // -------------------------------------------------------------- settings
  api.get('/settings', route(null, async (req, res) => {
    const uid = req.user.id;
    const profile = await query('SELECT full_name, email, phone FROM users WHERE id = $1', [uid]);
    const settings = await query('SELECT email_digest, sms_alerts, items_per_page, profile_public FROM settings WHERE user_id = $1', [uid]);
    const newsletters = await query('SELECT list, title, subscribed FROM newsletter_subscriptions WHERE user_id = $1 ORDER BY title', [uid]);
    const addresses = await query('SELECT id, label, line, is_default FROM addresses WHERE user_id = $1 ORDER BY id', [uid]);
    const withToken = addresses.rows.map((a) => ({ ...a, removeToken: sha256(`${req.cookies.sid}:${a.id}`).slice(0, 12) }));
    res.json({ profile: profile.rows[0], settings: settings.rows[0], newsletters: newsletters.rows, addresses: withToken });
  }));

  api.put('/profile', route('T4', async (req, res) => {
    const full_name = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim();
    const phone = String(req.body?.phone || '').trim();
    if (!full_name || !email || !phone) throw new HttpError(422, 'Name, email and phone are required.');
    const { rows: [cur] } = await query('SELECT full_name, email, phone FROM users WHERE id = $1', [req.user.id]);
    if (cur.full_name === full_name && cur.email === email && cur.phone === phone) req.scenario = 'Q5';
    await withTx(req, (c) => c.query('UPDATE users SET full_name = $1, email = $2, phone = $3 WHERE id = $4', [full_name, email, phone, req.user.id]));
    res.json({ ok: true });
  }));

  api.patch('/settings', route('R4', async (req, res) => {
    const { email_digest, items_per_page } = req.body || {};
    await withTx(req, async (c) => {
      if (email_digest) await c.query('UPDATE settings SET email_digest = $1 WHERE user_id = $2', [email_digest, req.user.id]);
      if (items_per_page) await c.query('UPDATE settings SET items_per_page = $1 WHERE user_id = $2', [Number(items_per_page), req.user.id]);
    });
    res.json({ saved: true });
  }));

  api.put('/settings/sms', route('R5', async (req, res) => {
    await withTx(req, (c) => c.query('UPDATE settings SET sms_alerts = $1 WHERE user_id = $2', [Boolean(req.body?.sms_alerts), req.user.id]));
    res.json({ saved: true });
  }));

  // PUT fired by a link (R8); a no-op when the address is already the default.
  api.put('/addresses/:id/default', route('R8', async (req, res) => {
    await withTx(req, async (c) => {
      const own = await c.query('SELECT is_default FROM addresses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      if (!own.rows[0]) throw new HttpError(404, 'Address not found.');
      if (own.rows[0].is_default) req.scenario = 'Q8';
      await c.query('UPDATE addresses SET is_default = (id = $1) WHERE user_id = $2', [req.params.id, req.user.id]);
    });
    res.json({ ok: true });
  }));

  api.put('/settings/privacy', route('T11', async (req, res) => {
    await withTx(req, (c) => c.query('UPDATE settings SET profile_public = $1 WHERE user_id = $2', [Boolean(req.body?.profile_public), req.user.id]));
    res.json({ saved: true });
  }));

  // --------------------------------------------------------------- support
  api.get('/support/tickets', route(null, async (req, res) => {
    const { rows } = await query('SELECT id, topic, subject FROM support_tickets WHERE user_id = $1 ORDER BY id DESC', [req.user.id]);
    res.json({ tickets: rows });
  }));

  app.use('/api', api);

  // ------------------------------------------------ server-side GET writes
  const requireLogin = (req, res, next) => (req.user ? next() : res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl)}`));

  // Wishlist add through a plain link (N1).
  app.get('/wishlist/add/:productId', requireLogin, route('N1', async (req, res) => {
    const id = Number(req.params.productId);
    await withTx(req, (c) => c.query('INSERT INTO wishlist (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, id]));
    const next = typeof req.query.next === 'string' && req.query.next.startsWith('/') ? req.query.next : `/products/${id}`;
    res.redirect(302, next);
  }));

  // Unsubscribe link (N5).
  app.get('/unsubscribe', requireLogin, route('N5', async (req, res) => {
    const list = String(req.query.list || '');
    await withTx(req, (c) => c.query('UPDATE newsletter_subscriptions SET subscribed = false WHERE user_id = $1 AND list = $2', [req.user.id, list]));
    res.redirect(302, `/settings?unsubscribed=${encodeURIComponent(list)}#privacy`);
  }));

  // Sign out through a plain link (N14).
  app.get('/logout', route('N14', async (req, res) => {
    if (req.cookies.sid) await withTx(req, (c) => c.query('DELETE FROM sessions WHERE token = $1', [req.cookies.sid]));
    res.clearCookie('sid', { path: '/' });
    res.redirect(302, '/login');
  }));

  // Delete through a plain link carrying a token, WordPress "Trash"-style (N15).
  app.get('/addresses/:id/remove', requireLogin, route('N15', async (req, res) => {
    const expected = sha256(`${req.cookies.sid}:${req.params.id}`).slice(0, 12);
    if (req.query.token !== expected) return res.redirect(302, '/settings?error=token#addresses');
    await withTx(req, (c) => c.query(
      'DELETE FROM addresses WHERE id = $1 AND user_id = $2 AND NOT EXISTS (SELECT 1 FROM orders WHERE address_id = $1)',
      [req.params.id, req.user.id],
    ));
    res.redirect(302, '/settings?removed=1#addresses');
  }));

  // Classic HTML form post with a 303 redirect (T5).
  app.post('/support/tickets', requireLogin, route('T5', async (req, res) => {
    const topic = String(req.body.topic || 'other');
    const subject = String(req.body.subject || '').trim();
    const body = String(req.body.body || '').trim();
    if (!subject || !body) return res.redirect(303, '/support?error=missing');
    const { rows: [t] } = await withTx(req, (c) => c.query(
      'INSERT INTO support_tickets (user_id, topic, subject, body) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.id, topic, subject, body],
    ));
    res.redirect(303, `/support?submitted=${t.id}`);
  }));

  // ------------------------------------------------------------ SPA shell
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { index: false }));
    app.get('*', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  } else {
    app.get('*', (req, res) => res.status(503).send('Client not built. Run `npm run build` in playground/.'));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message || 'Server error' });
  });

  return app;
}
