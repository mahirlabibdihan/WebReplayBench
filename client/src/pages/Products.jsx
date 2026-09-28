import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, money } from '../api.js';
import { useSummary } from '../App.jsx';
import { t } from '../i18n.js';

export function WishlistLink({ product, next }) {
  if (product.wishlisted) return <Link to="/wishlist" data-scenario="S5">♥ In wishlist</Link>;
  // A plain link whose GET request writes to the database (N1).
  return (
    <a href={`/wishlist/add/${product.id}?next=${encodeURIComponent(next)}`} data-scenario="N1">
      ♡ Add to wishlist
    </a>
  );
}

export default function Products() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useSummary();
  const [data, setData] = useState(null);
  const [filtered, setFiltered] = useState(null);
  const [hiddenCats, setHiddenCats] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ minPrice: '', maxPrice: '', inStock: false });
  const [query, setQuery] = useState(params.get('q') || '');
  const [toast, setToast] = useState('');
  const [compare, setCompare] = useState([]);

  const load = () => api(`/api/products?${params.toString()}`).then(setData);
  useEffect(() => {
    setFiltered(null);
    load();
  }, [params.toString()]);

  if (!data) return <p>Loading…</p>;
  const here = `/products${params.toString() ? `?${params}` : ''}`;
  const items = (filtered || data.items).filter((p) => !hiddenCats.includes(p.category));

  const search = (e) => {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (query) next.set('q', query); else next.delete('q');
    next.delete('page');
    setParams(next);
  };
  const setSort = (sort) => {
    const next = new URLSearchParams(params);
    next.set('sort', sort);
    setParams(next);
  };
  const applyFilters = async () => {
    const res = await api('/api/products/filter', { method: 'POST', body: { q: params.get('q') || '', ...filters }, scenario: 'Q1' });
    setFiltered(res.items);
  };
  const addToCart = async (p) => {
    await api('/api/cart', { method: 'POST', body: { productId: p.id, qty: 1 }, scenario: 'T1' });
    setToast(`Added ${p.name} to your cart.`);
    refresh();
  };
  const quickAdd = async (e, p) => {
    e.preventDefault();
    const cart = await api(`/api/cart/quick-add/${p.id}`, { scenario: 'N7' });
    const line = cart.items.find((i) => i.product_id === p.id);
    setToast(`Quick-added ${p.name} (${line?.qty ?? 1} in cart).`);
    refresh();
  };

  return (
    <>
      <h1>Products</h1>
      <form role="search" onSubmit={search} className="row">
        <input type="search" aria-label="Search products" placeholder="Search products" value={query}
          onChange={(e) => setQuery(e.target.value)} data-scenario="P8" />
        <button type="submit" data-scenario="S6">Search</button>
        <label>Sort by{' '}
          <select value={params.get('sort') || 'featured'} onChange={(e) => setSort(e.target.value)} data-scenario="S4">
            <option value="featured">Featured</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="name">Name</option>
          </select>
        </label>
      </form>

      <fieldset className="row">
        <legend>Categories</legend>
        {data.categories.map((c) => (
          <label key={c}>
            <input type="checkbox" checked={!hiddenCats.includes(c)} data-scenario="S3"
              onChange={() => setHiddenCats((h) => (h.includes(c) ? h.filter((x) => x !== c) : [...h, c]))} /> {c}
          </label>
        ))}
      </fieldset>

      <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)} data-scenario="P1">
        More filters
      </button>
      {showFilters && (
        <div className="panel row">
          <label>Min price <input inputMode="decimal" value={filters.minPrice} onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })} /></label>
          <label>Max price <input inputMode="decimal" value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })} /></label>
          <label><input type="checkbox" checked={filters.inStock} onChange={(e) => setFilters({ ...filters, inStock: e.target.checked })} /> In stock only</label>
          <button type="button" onClick={applyFilters} data-scenario="Q1">Apply filters</button>
          {filtered && <button type="button" onClick={() => setFiltered(null)}>Clear filters</button>}
        </div>
      )}

      {toast && <p role="status" className="toast">{toast}</p>}
      <p>{filtered ? `Showing ${items.length} filtered results` : `Showing ${items.length} of ${data.total} products`}</p>
      {compare.length > 0 && <p role="status">Comparing {compare.length} product{compare.length === 1 ? '' : 's'}.</p>}

      <ul className="grid">
        {items.map((p) => (
          <li key={p.id} className="card">
            <Link to={`/products/${p.id}`} className="card-title" data-scenario="N4">{p.name}</Link>
            <div>{p.category} · {money(p.price_cents)} · {p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}</div>
            <div className="row">
              <button type="button" onClick={() => addToCart(p)} data-scenario="T1">{t('Add to cart')}</button>
              <WishlistLink product={p} next={here} />
              <a href="#" onClick={(e) => quickAdd(e, p)} data-scenario="N7">Quick add +1</a>
              <a href={`/products/${p.id}`} target="_blank" rel="noopener" data-scenario="S7">Open in new tab</a>
              <label>
                <input type="checkbox" checked={compare.includes(p.id)} data-scenario="S9"
                  onChange={() => setCompare((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))} /> Compare
              </label>
            </div>
          </li>
        ))}
      </ul>

      {!filtered && data.pages > 1 && (
        <nav aria-label="Pagination" className="row">
          {Array.from({ length: data.pages }, (_, i) => i + 1).map((n) => {
            const next = new URLSearchParams(params);
            next.set('page', String(n));
            return n === data.page ? <span key={n} aria-current="page">Page {n}</span> : (
              <a key={n} href={`/products?${next}`} onClick={(e) => { e.preventDefault(); navigate(`/products?${next}`); }} data-scenario="S5">Page {n}</a>
            );
          })}
        </nav>
      )}
    </>
  );
}
