import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { useSummary } from '../App.jsx';

export default function Wishlist() {
  const { refresh } = useSummary();
  const [items, setItems] = useState(null);
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
  return (
    <>
      <h1>Wishlist</h1>
      {items.length === 0 ? <p>Your wishlist is empty.</p> : (
        <ul>
          {items.map((p) => (
            <li key={p.id} className="row">
              <Link to={`/products/${p.id}`} data-scenario="N4">{p.name}</Link> {money(p.price_cents)}
              <button type="button" onClick={() => remove(p)} data-scenario="T2">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
