import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { useSummary } from '../App.jsx';

const readCompact = () => {
  try {
    return localStorage.getItem('compact_wishlist') === '1';
  } catch {
    return false;
  }
};

export default function Wishlist() {
  const { refresh } = useSummary();
  const [items, setItems] = useState(null);
  const [compact, setCompact] = useState(readCompact);
  const load = () => api('/api/wishlist').then((d) => setItems(d.items));
  useEffect(() => {
    load();
  }, []);
  if (!items) return <p>Loading…</p>;
  const remove = async (p) => {
    await api(`/api/wishlist/${p.id}`, { method: 'DELETE', scenario: 'T2' });
    await load();
    refresh();
  };
  // Persistent client-side preference that changes what the page shows (C6).
  const setCompactView = (on) => {
    localStorage.setItem('compact_wishlist', on ? '1' : '0');
    setCompact(on);
  };
  return (
    <>
      <h1>Wishlist</h1>
      <label className="block">
        <input type="checkbox" checked={compact} onChange={(e) => setCompactView(e.target.checked)} data-scenario="C6" /> Compact view
      </label>
      {items.length === 0 ? <p>Your wishlist is empty.</p> : (
        <ul>
          {items.map((p) => (
            <li key={p.id} className="row">
              <Link to={`/products/${p.id}`} data-scenario="N4">{p.name}</Link>
              {!compact && <span>{money(p.price_cents)}</span>}
              <button type="button" onClick={() => remove(p)} data-scenario="T2">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
