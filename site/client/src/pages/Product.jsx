import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money } from '../api.js';
import { useSummary } from '../App.jsx';
import { t } from '../i18n.js';
import { Thumb, WishlistLink } from './Products.jsx';

export default function Product() {
  const { id } = useParams();
  const { refresh } = useSummary();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const [qty, setQty] = useState(1);
  const [section, setSection] = useState('Description');
  const [reviews, setReviews] = useState([]);
  const [zip, setZip] = useState('');
  const [delivery, setDelivery] = useState('');
  const [rating, setRating] = useState(null);
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setP(null);
    // This GET also records the product as recently viewed (N4).
    api(`/api/products/${id}`).then((d) => {
      setP(d);
      setReviews(d.reviews);
      setRating(d.myRating);
    }).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p role="alert">{error}</p>;
  if (!p) return <p>Loading…</p>;

  const addToCart = async () => {
    await api('/api/cart', { method: 'POST', body: { productId: p.id, qty }, scenario: 'T1' });
    setStatus(`Added ${qty} × ${p.name} to your cart.`);
    refresh();
  };
  const loadMore = async () => {
    const res = await api(`/api/products/${p.id}/reviews?offset=${reviews.length}`, { scenario: 'P3' });
    setReviews([...reviews, ...res.reviews]);
  };
  const checkDelivery = async () => {
    try {
      setDelivery((await api(`/api/products/${p.id}/delivery?zip=${encodeURIComponent(zip)}`, { scenario: 'P4' })).estimate);
    } catch (e) {
      setDelivery(e.message);
    }
  };
  // A POST fired by a radio button (N11).
  // Write a review: a form button posting a payload (T17).
  const postReview = async (e) => {
    e.preventDefault();
    const res = await api(`/api/products/${p.id}/reviews`, { method: 'POST', body: { body: draft }, scenario: 'T17' });
    setP({ ...p, reviewCount: res.reviewCount });
    setDraft('');
    setStatus('Thanks for your review.');
  };
  const rate = async (stars) => {
    setRating(stars);
    await api(`/api/products/${p.id}/rating`, { method: 'POST', body: { stars }, scenario: 'N11' });
  };
  // Follow toggle through a GET (N18).
  const toggleFollow = async (e) => {
    e.preventDefault();
    const res = await api(`/api/products/${p.id}/follow`, { scenario: 'N18' });
    setP({ ...p, followed: res.followed });
  };
  // Remove through a link that issues a DELETE (R9).
  const removeFromWishlist = async (e) => {
    e.preventDefault();
    await api(`/api/wishlist/${p.id}`, { method: 'DELETE', scenario: 'R9' });
    setP({ ...p, wishlisted: false });
    refresh();
  };
  const checkStock = async () => {
    setStatus((await api(`/api/products/${p.id}/stock`, { scenario: 'P11' })).message);
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch { /* clipboard may be unavailable in automation */ }
    setStatus('Link copied.');
  };

  return (
    <article>
      <p><Link to="/products" data-scenario="S5">← All products</Link></p>
      <div className="product">
      <Thumb id={p.id} />
      <div>
      <p className="eyebrow">{p.category}</p>
      <h1>{p.name}</h1>
      <p className="meta"><strong className="price">{money(p.price_cents)}</strong> · <span className={p.stock > 0 ? 'stock' : 'stock out'}>{p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}</span></p>
      <div className="row">
        <label>Quantity{' '}
          <select value={qty} onChange={(e) => setQty(Number(e.target.value))} data-scenario="S8">
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" onClick={addToCart} data-scenario="T1">{t('Add to cart')}</button>
        <WishlistLink product={p} next={`/products/${p.id}`} />
        {p.wishlisted && <a href="#" onClick={removeFromWishlist} data-scenario="R9">Remove from wishlist</a>}
        <a href="#" onClick={toggleFollow} data-scenario="N18">{p.followed ? 'Following' : 'Follow'}</a>
        <button type="button" onClick={checkStock} data-scenario="P11">Check stock</button>
        <button type="button" onClick={copyLink} data-scenario="P7">Copy link</button>
      </div>
      {status && <p role="status" className="toast">{status}</p>}
      </div>
      </div>

      <div className="row tabs mt-8 w-fit" aria-label="Product sections">
        {['Description', 'Specs', 'Reviews'].map((s) => (
          <button key={s} type="button" aria-pressed={section === s} onClick={() => setSection(s)} data-scenario="P2">{s}</button>
        ))}
      </div>
      <section className="panel" aria-label={section}>
        {section === 'Description' && <p>{p.description}</p>}
        {section === 'Specs' && <p>{p.specs}</p>}
        {section === 'Reviews' && (
          <>
            <ul>{reviews.map((r) => <li key={r.id}>{'★'.repeat(r.stars)} {r.author}: {r.body}</li>)}</ul>
            {reviews.length < p.reviewCount && <button type="button" onClick={loadMore} data-scenario="P3">Load more reviews</button>}
            <form onSubmit={postReview} className="row">
              <label>Your review <input value={draft} onChange={(e) => setDraft(e.target.value)} data-scenario="T17" /></label>
              <button type="submit" data-scenario="T17">Post review</button>
            </form>
          </>
        )}
      </section>

      <section aria-label="Delivery" className="row panel">
        <label>ZIP code <input value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" /></label>
        <button type="button" onClick={checkDelivery} data-scenario="P4">Check delivery</button>
        {delivery && <span role="status">{delivery}</span>}
      </section>

      <fieldset className="row">
        <legend>Your rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n}>
            <input type="radio" name="rating" checked={rating === n} onChange={() => rate(n)} data-scenario="N11" /> {n} {n === 1 ? 'star' : 'stars'}
          </label>
        ))}
        {rating && <span role="status">You rated this {rating} {rating === 1 ? 'star' : 'stars'}.</span>}
      </fieldset>
    </article>
  );
}
