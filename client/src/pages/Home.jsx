import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { t } from '../i18n.js';

const readHidden = () => {
  try {
    return localStorage.getItem('hide_recently_viewed') === '1';
  } catch {
    return false;
  }
};

export default function Home() {
  const [home, setHome] = useState(null);
  const [hideRecent, setHideRecent] = useState(readHidden);
  useEffect(() => {
    api('/api/home').then(setHome);
  }, []);
  if (!home) return <p>Loading…</p>;

  // Persistent client-side preference (C5).
  const hide = () => {
    localStorage.setItem('hide_recently_viewed', '1');
    setHideRecent(true);
  };
  // Read-only GET behind a button named exactly "Refresh" (S12).
  const refreshDeal = async () => setHome(await api('/api/home', { scenario: 'S12' }));

  return (
    <>
      <h1>Welcome back</h1>
      {/* Filled by hidden writes when products are opened (N4); sits above
          "Trending now" so new entries shift the element ids below it (H8). */}
      {!hideRecent && (
        <section aria-label={t('Recently viewed')}>
          <h2>{t('Recently viewed')}</h2>
          {home.recentlyViewed.length === 0 ? (
            <p>Nothing viewed yet.</p>
          ) : (
            <ul className="chips">
              {home.recentlyViewed.map((p) => (
                <li key={p.id}><Link to={`/products/${p.id}`} data-scenario="N4">{p.name}</Link></li>
              ))}
            </ul>
          )}
          <button type="button" onClick={hide} data-scenario="C5">Hide recently viewed</button>
        </section>
      )}
      {/* Re-shuffled on every load (H3). */}
      <section aria-label={t('Trending now')}>
        <h2>{t('Trending now')}</h2>
        <ol>
          {home.trending.map((p) => (
            <li key={p.id}><Link to={`/products/${p.id}`} data-scenario="N4">{p.name}</Link> — {money(p.price_cents)}</li>
          ))}
        </ol>
      </section>
      <section aria-label="Shortcuts">
        <h2>Shortcuts</h2>
        <ul className="chips">
          <li><Link to="/inbox" data-scenario="S5">Check your inbox</Link></li>
          <li><Link to="/offers" data-scenario="S5">See offers</Link></li>
          <li><Link to="/todos" data-scenario="S5">Your todo list</Link></li>
        </ul>
      </section>
      {/* Changes on every load, but in a region unrelated to other actions (H3). */}
      <footer className="deal" aria-label={t('Deal of the moment')}>
        <strong>{t('Deal of the moment')}:</strong>{' '}
        <Link to={`/products/${home.deal.id}`} data-scenario="N4">{home.deal.name}</Link> at {money(home.deal.price_cents)}{' '}
        <button type="button" onClick={refreshDeal} data-scenario="S12">Refresh</button>
      </footer>
    </>
  );
}
