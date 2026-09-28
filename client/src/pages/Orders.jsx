import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money } from '../api.js';

function OrderSummary({ o }) {
  return (
    <>
      <p>
        Placed {o.placed_at} · {o.shipping} shipping to {o.address}
        {o.coupon_code ? ` · coupon ${o.coupon_code}` : ''}
      </p>
      <ul>
        {o.items.map((i, k) => (
          <li key={k}>{i.qty} × {i.name} — {money(i.qty * i.price_cents)}</li>
        ))}
      </ul>
      <p>Total: <strong>{money(o.total_cents)}</strong></p>
    </>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    api('/api/orders').then((d) => setOrders(d.orders));
  }, []);
  if (!orders) return <p>Loading…</p>;
  return (
    <>
      <h1>Your orders</h1>
      {orders.length === 0 && <p>No orders yet.</p>}
      {orders.map((o) => (
        <section key={o.id} className="panel" aria-label={`Order #${o.id}`}>
          <h2><Link to={`/orders/${o.id}`} data-scenario="S5">Order #{o.id}</Link></h2>
          <OrderSummary o={o} />
        </section>
      ))}
    </>
  );
}

export function Order() {
  const { id } = useParams();
  const [o, setO] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/api/orders/${id}`).then(setO).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <p role="alert">{error}</p>;
  if (!o) return <p>Loading…</p>;
  return (
    <>
      <h1>Order #{o.id} confirmed</h1>
      <OrderSummary o={o} />
      <Link to="/orders" data-scenario="S5">All orders</Link>
    </>
  );
}
