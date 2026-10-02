// Every fetch carries the scenario id of the element that triggered it, so the
// server can tag the resulting audit rows (see playground/scenarios.json).
export async function api(path, { method = 'GET', body, scenario } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (scenario) headers['x-scenario'] = scenario;
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401 && !path.endsWith('/login')) {
    const next = window.location.pathname + window.location.search + window.location.hash;
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
    throw new Error('Not signed in.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export function getCookie(name) {
  return document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.split('=')[1];
}
