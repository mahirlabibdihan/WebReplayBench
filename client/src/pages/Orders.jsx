import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money } from '../api.js';
import { useSummary } from '../App.jsx';

function OrderItems({ o }) {
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
    </>
  );
}

export default function Orders() {
  const navigate = useNavigate();
  const { refresh } = useSummary();
  const [orders, setOrders] = useState(null);
  const [open, setOpen] = useState([]);
  const [csv, setCsv] = useState('');
  const [status, setStatus] = useState('');
  const load = () => api('/api/orders').then((d) => setOrders(d.orders));
  useEffect(() => {
    load();
  }, []);
  if (!orders) return <p>Loading…</p>;

  const toggle = (id) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const reorder = async (o) => {
    await api(`/api/orders/${o.id}/reorder`, { method: 'POST', body: {}, scenario: 'T14' });
    refresh();
    navigate('/cart');
  };
  const cancel = async (o) => {
    if (!window.confirm(`Cancel order #${o.id}?`)) return;
    await api(`/api/orders/${o.id}`, { method: 'PATCH', body: { status: 'cancelled' }, scenario: 'T16' });
    setStatus(`Order #${o.id} cancelled.`);
    load();
  };
  // Read-only GET behind a button named exactly "Export" (S13).
  const exportOrders = async () => setCsv((await api('/api/orders/export', { scenario: 'S13' })).csv);

  return (
    <>
      <h1>Your orders</h1>
      <div className="row">
        <button type="button" onClick={() => setOpen(orders.map((o) => o.id))} data-scenario="P10">Expand all</button>
        <button type="button" onClick={exportOrders} data-scenario="S13">Export</button>
      </div>
      {csv && <pre aria-label="Exported orders">{csv}</pre>}
      {status && <p role="status" className="toast">{status}</p>}
      {orders.length === 0 && <p>No orders yet.</p>}
      {orders.map((o) => (
        <section key={o.id} className="panel" aria-label={`Order #${o.id}`}>
          <h2><Link to={`/orders/${o.id}`} data-scenario="S5">Order #{o.id}</Link></h2>
          <p>Status: <strong>{o.status === 'cancelled' ? 'Cancelled' : 'Placed'}</strong> · Total: <strong>{money(o.total_cents)}</strong></p>
          <div className="row">
            <button type="button" aria-expanded={open.includes(o.id)} onClick={() => toggle(o.id)} data-scenario="P13">Show details</button>
            <button type="button" onClick={() => reorder(o)} data-scenario="T14">Reorder</button>
            {o.status !== 'cancelled' && <button type="button" onClick={() => cancel(o)} data-scenario="T16">Cancel order</button>}
          </div>
          {open.includes(o.id) && <OrderItems o={o} />}
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
      <h1>Order #{o.id} {o.status === 'cancelled' ? 'cancelled' : 'confirmed'}</h1>
      <OrderItems o={o} />
      <p>Total: <strong>{money(o.total_cents)}</strong></p>
      <Link to="/orders" data-scenario="S5">All orders</Link>
    </>
  );
}
