// Verifies the ground-truth oracle: each server-side scenario is exercised over
// HTTP and must produce audit rows exactly when the catalog says so.
import 'dotenv/config';

const APP = `http://localhost:${process.env.PORT || 4000}`;
const ADMIN = `http://${process.env.ADMIN_HOST || '127.0.0.1'}:${process.env.ADMIN_PORT || 4001}`;

const adminGet = async (p) => (await fetch(ADMIN + p)).json();
const adminPost = async (p, body = {}) =>
  (await fetch(ADMIN + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

let cookie = '';
async function call(method, p, body, { contentType = 'application/json', redirect = 'manual' } = {}) {
  const headers = { cookie };
  let payload;
  if (body !== undefined) {
    headers['content-type'] = contentType;
    payload = contentType === 'application/json' ? JSON.stringify(body) : body;
  }
  const res = await fetch(APP + p, { method, headers, body: payload, redirect });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return res;
}

const settle = () => new Promise((r) => setTimeout(r, 150));

await adminPost('/reset', { dynamic: false });
await call('POST', '/api/login', { username: 'jordan', password: 'playground123' });
const settings = await (await call('GET', '/api/settings')).json();
const office = settings.addresses.find((a) => a.label === 'Office');

// [scenario, expectWrite, action]
const cases = [
  ['S-read', false, () => call('GET', '/api/products?q=mouse')],
  ['P3', false, () => call('GET', '/api/products/1/reviews?offset=3')],
  ['P4', false, () => call('GET', '/api/products/1/delivery?zip=12345')],
  ['Q1', false, () => call('POST', '/api/products/filter', { q: 'usb', maxPrice: 20 })],
  ['Q2', false, () => call('POST', '/api/preview', { markdown: '**hi**' })],
  ['Q3', false, () => call('POST', '/api/coupons/validate', { code: 'WELCOME10' })],
  ['P9', false, () => call('GET', '/api/todos')],
  ['Q5', false, () => call('PUT', '/api/profile', { full_name: 'Jordan Lee', email: 'jordan.lee@example.test', phone: '555-0100' })],
  ['Q6', false, () => call('POST', '/api/orders', { addressId: 1, shipping: 'standard', acceptTerms: false })],
  ['T1', true, () => call('POST', '/api/cart', { productId: 3, qty: 1 })],
  ['R2', true, () => call('PATCH', '/api/cart/1', { qty: 3 })],
  ['T2', true, () => call('DELETE', '/api/cart/2')],
  ['N1', true, () => call('GET', '/wishlist/add/1?next=/products')],
  ['N1-repeat (idempotent)', false, () => call('GET', '/wishlist/add/1?next=/products')],
  ['N2', true, () => call('GET', '/api/messages/1/toggle-star')],
  ['N3', true, () => call('GET', '/api/messages/2')],
  ['N3-repeat (already read)', false, () => call('GET', '/api/messages/2')],
  ['N4', true, () => call('GET', '/api/products/4')],
  ['N5', true, () => call('GET', '/unsubscribe?list=weekly-picks')],
  ['N6', true, () => call('GET', '/api/coupons/claim?code=SAVE15')],
  ['N6-repeat (409)', false, () => call('GET', '/api/coupons/claim?code=SAVE15')],
  ['N7', true, () => call('GET', '/api/cart/quick-add/5')],
  ['N7-repeat (non-idempotent)', true, () => call('GET', '/api/cart/quick-add/5')],
  ['N8', true, () => call('GET', '/api/drafts/save?message=1&body=Looks%20good')],
  ['R7', true, () => call('PATCH', '/api/todos/1', { done: true })],
  ['N10', true, () => call('POST', '/api/messages/3/archive', {})],
  ['N11', true, () => call('POST', '/api/products/4/rating', { stars: 4 })],
  ['R8', true, () => call('PUT', `/api/addresses/${office.id}/default`, {})],
  ['Q8', false, () => call('PUT', `/api/addresses/${office.id}/default`, {})],
  ['N15', true, () => call('GET', `/addresses/${office.id}/remove?token=${office.removeToken}`)],
  ['R1', true, () => call('DELETE', '/api/messages/9')],
  ['R3', true, () => call('PATCH', '/api/notes', { body: 'new note' })],
  ['R4', true, () => call('PATCH', '/api/settings', { email_digest: 'weekly' })],
  ['R5', true, () => call('PUT', '/api/settings/sms', { sms_alerts: false })],
  ['R6', true, () => call('PATCH', '/api/messages/5', { is_read: false })],
  ['T4', true, () => call('PUT', '/api/profile', { full_name: 'Jordan Lee', email: 'jordan.lee@example.test', phone: '555-0142' })],
  ['T5', true, () => call('POST', '/support/tickets', 'topic=order&subject=Damaged+mug&body=Arrived+cracked', { contentType: 'application/x-www-form-urlencoded' })],
  ['T7', true, () => call('DELETE', '/api/messages/10')],
  ['T8', true, () => call('POST', '/api/messages/1/reply', { body: 'Approved' })],
  ['T9', true, () => call('POST', '/api/todos', { title: 'Book dentist' })],
  ['T10', true, () => call('DELETE', '/api/todos/3')],
  ['T11', true, () => call('PUT', '/api/settings/privacy', { profile_public: true })],
  ['Q7', false, () => call('DELETE', '/api/drafts/2')],
  ['N8b (draft for T12)', true, () => call('GET', '/api/drafts/save?message=2&body=hello')],
  ['T12', true, () => call('DELETE', '/api/drafts/2')],
  ['N16', true, () => call('GET', '/api/messages/mark-all-read')],
  ['P11', false, () => call('GET', '/api/products/1/stock')],
  ['P12', false, () => call('GET', '/api/messages?q=budget')],
  ['S13', false, () => call('GET', '/api/orders/export')],
  ['Q9', false, () => call('POST', '/api/cart/estimate', {})],
  ['Q10', false, () => call('POST', '/api/support/preview', { subject: 'Hi', body: 'There' })],
  ['Q11', false, () => call('POST', '/api/addresses/validate', { label: 'Gym', line: '5 Park Road, Springfield' })],
  ['Q12', false, () => call('PATCH', '/api/messages/3', { is_read: false })],
  ['Q13', false, () => call('PATCH', '/api/notes', { body: 'new note' })],
  ['N17', true, () => call('GET', '/api/messages/4/snooze')],
  ['N17-repeat (one-way)', false, () => call('GET', '/api/messages/4/snooze')],
  ['N18', true, () => call('GET', '/api/products/2/follow')],
  ['N18-repeat (toggle)', true, () => call('GET', '/api/products/2/follow')],
  ['N19', true, () => call('POST', '/api/todos/2/priority', { priority: 'high' })],
  ['R9', true, () => call('DELETE', '/api/wishlist/13')],
  ['R10', true, () => call('PUT', '/api/newsletters/outdoor-club', { subscribed: true })],
  ['R11', true, () => call('DELETE', '/api/messages/8')],
  ['T13', true, () => call('DELETE', '/api/cart')],
  ['T14', true, () => call('POST', '/api/orders/1/reorder', {})],
  ['T15', true, () => call('POST', '/api/addresses', { label: 'Gym', line: '5 Park Road, Springfield' })],
  ['T15-invalid (422)', false, () => call('POST', '/api/addresses', { label: 'Gym', line: 'nowhere' })],
  ['T16', true, () => call('PATCH', '/api/orders/1', { status: 'cancelled' })],
  ['T16-repeat (no-op)', false, () => call('PATCH', '/api/orders/1', { status: 'cancelled' })],
  ['T3', true, () => call('POST', '/api/orders', { addressId: 1, shipping: 'standard', acceptTerms: true })],
  ['N14', true, () => call('GET', '/logout')],
];

let failures = 0;
for (const [name, expectWrite, action] of cases) {
  const before = await adminGet('/watermark');
  const res = await action();
  await settle();
  const { rows } = await adminGet(`/audit?after=${before.audit}`);
  const reqs = (await adminGet(`/requests?after=${before.request}`)).rows;
  const wrote = rows.length > 0;
  const ok = wrote === expectWrite;
  if (!ok) failures += 1;
  const tables = [...new Set(rows.map((r) => `${r.op[0]}:${r.tbl}`))].join(',');
  const tags = [...new Set(reqs.map((r) => r.scenario).filter(Boolean))].join(',');
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(28)} status=${res.status} wrote=${wrote} ${tables} tag=${tags}`);
}

const fp1 = await adminGet('/fingerprint');
await adminPost('/reset', { dynamic: false });
const fp2 = await adminGet('/fingerprint');
await adminPost('/reset', { dynamic: false });
const fp3 = await adminGet('/fingerprint');
const same = JSON.stringify(fp2) === JSON.stringify(fp3);
const differs = JSON.stringify(fp1) !== JSON.stringify(fp2);
console.log(`${same ? 'ok  ' : 'FAIL'} reset is deterministic`);
console.log(`${differs ? 'ok  ' : 'FAIL'} reset restores the seed state`);
if (!same || !differs) failures += 1;

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
