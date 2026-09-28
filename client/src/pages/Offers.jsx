import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Offers() {
  const [coupons, setCoupons] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => api('/api/offers').then((d) => setCoupons(d.coupons));
  useEffect(() => {
    load();
  }, []);
  if (!coupons) return <p>Loading…</p>;

  // One-time claim through a GET (N6); once it succeeds the link is gone (H7).
  const claim = async (e, code) => {
    e.preventDefault();
    try {
      await api(`/api/coupons/claim?code=${encodeURIComponent(code)}`, { scenario: 'N6' });
      setMsg(`Coupon ${code} claimed. Use it at checkout.`);
    } catch (err) {
      setMsg(err.message);
    }
    load();
  };

  return (
    <>
      <h1>Offers</h1>
      {msg && <p role="status" className="toast">{msg}</p>}
      <ul>
        {coupons.map((c) => (
          <li key={c.code} className="panel">
            <strong>{c.code}</strong> — {c.description}{' '}
            {c.claimed ? (
              <span>Claimed ✓</span>
            ) : (
              <a href="#" onClick={(e) => claim(e, c.code)} data-scenario="N6">Claim {c.code}</a>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
