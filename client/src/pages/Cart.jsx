import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { useSummary } from '../App.jsx';

export default function Cart() {
  const { refresh } = useSummary();
  const [cart, setCart] = useState(null);
  const [estimateText, setEstimateText] = useState('');
  useEffect(() => {
    api('/api/cart').then(setCart);
  }, []);
  if (!cart) return <p>Loading…</p>;

  // Quantity changes save immediately through PATCH (R2).
  const setQty = async (item, qty) => {
    setCart(await api(`/api/cart/${item.id}`, { method: 'PATCH', body: { qty }, scenario: 'R2' }));
    refresh();
  };
  const remove = async (item) => {
    setCart(await api(`/api/cart/${item.id}`, { method: 'DELETE', scenario: 'T2' }));
    refresh();
  };
  const clearCart = async () => {
    setCart(await api('/api/cart', { method: 'DELETE', scenario: 'T13' }));
    refresh();
  };
  // Read-only POST (Q9).
  const estimate = async () => {
    const e = await api('/api/cart/estimate', { method: 'POST', body: {}, scenario: 'Q9' });
    setEstimateText(`With standard shipping: ${money(e.standard_cents)} · with express shipping: ${money(e.express_cents)}`);
  };

  return (
    <>
      <h1>Your cart</h1>
      {cart.items.length === 0 ? <p>Your cart is empty.</p> : (
        <table>
          <thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th /></tr></thead>
          <tbody>
            {cart.items.map((it) => (
              <tr key={it.id}>
                <td><Link to={`/products/${it.product_id}`} data-scenario="N4">{it.name}</Link></td>
                <td>{money(it.price_cents)}</td>
                <td>
                  <select aria-label={`Quantity for ${it.name}`} value={it.qty} onChange={(e) => setQty(it, Number(e.target.value))} data-scenario="R2">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td><button type="button" onClick={() => remove(it)} data-scenario="T2">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>Subtotal: <strong>{money(cart.subtotal_cents)}</strong></p>
      {cart.items.length > 0 && (
        <div className="row">
          <button type="button" onClick={estimate} data-scenario="Q9">Estimate shipping</button>
          <button type="button" onClick={clearCart} data-scenario="T13">Clear cart</button>
        </div>
      )}
      {estimateText && <p role="status">{estimateText}</p>}
      {cart.items.length > 0 && <Link to="/checkout" data-scenario="S5">Proceed to checkout</Link>}
    </>
  );
}
