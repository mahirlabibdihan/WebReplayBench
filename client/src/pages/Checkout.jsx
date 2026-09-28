import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, money } from '../api.js';
import { useSummary } from '../App.jsx';

// Three-step wizard whose step lives only in memory: the URL stays /checkout
// and a refresh starts over (H1).
export default function Checkout() {
  const navigate = useNavigate();
  const { refresh } = useSummary();
  const [data, setData] = useState(null);
  const [step, setStep] = useState(1);
  const [addressId, setAddressId] = useState(null);
  const [shipping, setShipping] = useState('standard');
  const [code, setCode] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponMsg, setCouponMsg] = useState('');
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/checkout').then((d) => {
      setData(d);
      setAddressId(d.addresses[0]?.id ?? null);
    });
  }, []);
  if (!data) return <p>Loading…</p>;
  if (data.cart.items.length === 0) return <><h1>Checkout</h1><p>Your cart is empty.</p></>;

  const subtotal = data.cart.subtotal_cents;
  const discount = coupon ? Math.round((subtotal * coupon.percent_off) / 100) : 0;
  const total = subtotal - discount + data.shipping[shipping];

  const applyCoupon = async () => {
    try {
      const c = await api('/api/coupons/validate', { method: 'POST', body: { code }, scenario: 'Q3' });
      setCoupon(c);
      setCouponMsg(`${c.code} applied: ${c.percent_off}% off.`);
    } catch (e) {
      setCoupon(null);
      setCouponMsg(e.message);
    }
  };
  const placeOrder = async () => {
    setError('');
    try {
      const { orderId } = await api('/api/orders', {
        method: 'POST',
        body: { addressId, shipping, couponCode: coupon?.code || null, acceptTerms: accept },
        scenario: accept ? 'T3' : 'Q6',
      });
      refresh();
      navigate(`/orders/${orderId}`);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <h1>Checkout</h1>
      <ol className="steps" aria-label="Checkout steps">
        {['Shipping', 'Payment', 'Review'].map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? 'step' : undefined}>{s}</li>
        ))}
      </ol>

      {step === 1 && (
        <section aria-label="Shipping">
          <fieldset>
            <legend>Deliver to</legend>
            {data.addresses.map((a) => (
              <label key={a.id} className="block">
                <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} /> {a.label}: {a.line}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Shipping method</legend>
            {Object.entries(data.shipping).map(([k, cents]) => (
              <label key={k} className="block">
                <input type="radio" name="shipping" checked={shipping === k} onChange={() => setShipping(k)} />
                {k === 'standard' ? ' Standard' : ' Express'} shipping ({money(cents)})
              </label>
            ))}
          </fieldset>
          <button type="button" onClick={() => setStep(2)} data-scenario="P6">Continue</button>
        </section>
      )}

      {step === 2 && (
        <section aria-label="Payment">
          <fieldset>
            <legend>Payment method</legend>
            <label className="block"><input type="radio" name="payment" defaultChecked /> Saved card ending 4242</label>
          </fieldset>
          <div className="row">
            <label>Coupon code <input value={code} onChange={(e) => setCode(e.target.value)} /></label>
            <button type="button" onClick={applyCoupon} data-scenario="Q3">Apply coupon</button>
            {couponMsg && <span role="status">{couponMsg}</span>}
          </div>
          <div className="row">
            <button type="button" onClick={() => setStep(1)}>Back</button>
            <button type="button" onClick={() => setStep(3)} data-scenario="P6">Continue</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section aria-label="Review">
          <ul>
            {data.cart.items.map((it) => (
              <li key={it.id}>{it.qty} × {it.name} — {money(it.qty * it.price_cents)}</li>
            ))}
          </ul>
          <p>Deliver to: {data.addresses.find((a) => a.id === addressId)?.line}</p>
          <p>Shipping: {shipping} ({money(data.shipping[shipping])})</p>
          {coupon && <p>Discount ({coupon.code}): −{money(discount)}</p>}
          <p>Total: <strong>{money(total)}</strong></p>
          <label className="block">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} /> I accept the terms of sale
          </label>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="row">
            <button type="button" onClick={() => setStep(2)}>Back</button>
            <button type="button" onClick={placeOrder} data-scenario="T3">Place order</button>
          </div>
        </section>
      )}
    </>
  );
}
