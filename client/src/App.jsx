import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { t } from './i18n.js';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Products from './pages/Products.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import Orders, { Order } from './pages/Orders.jsx';
import Offers from './pages/Offers.jsx';
import Wishlist from './pages/Wishlist.jsx';
import Inbox from './pages/Inbox.jsx';
import Message from './pages/Message.jsx';
import Todos from './pages/Todos.jsx';
import Notes from './pages/Notes.jsx';
import Settings from './pages/Settings.jsx';
import Support from './pages/Support.jsx';

const SummaryContext = createContext({ summary: null, refresh: () => {} });
export const useSummary = () => useContext(SummaryContext);

const readDismissed = () => {
  try {
    return JSON.parse(localStorage.getItem('dismissed_announcements') || '[]');
  } catch {
    return [];
  }
};

export function applyTheme() {
  document.documentElement.dataset.theme = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
}

function Announcement() {
  const [home, setHome] = useState(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  useEffect(() => {
    api('/api/home').then(setHome).catch(() => {});
  }, []);
  const a = home?.announcement;
  if (!a || dismissed.includes(a.id)) return null;
  const dismiss = () => {
    const next = [...dismissed, a.id];
    localStorage.setItem('dismissed_announcements', JSON.stringify(next));
    setDismissed(next);
  };
  return (
    <div className="announcement" role="region" aria-label="Announcement">
      <span>{a.text}</span>
      <button type="button" onClick={dismiss} data-scenario="C2">{t('Dismiss announcement')}</button>
    </div>
  );
}

function Header({ summary }) {
  const nav = [
    ['/', 'Home'], ['/products', 'Products'], ['/offers', 'Offers'],
    ['/cart', 'Cart', summary?.cart], ['/wishlist', 'Wishlist', summary?.wishlist],
    ['/inbox', 'Inbox', summary?.unread], ['/todos', 'Todos'], ['/notes', 'Notes'],
    ['/orders', 'Orders'], ['/support', 'Support'], ['/settings', 'Settings'],
  ];
  return (
    <header className="site-header">
      <div className="brand">Nimbus Market</div>
      <nav aria-label="Main">
        {nav.map(([to, label, count]) => (
          <NavLink key={to} to={to} end={to === '/'} data-scenario="S5">
            {t(label)}{count != null ? ` (${count})` : ''}
          </NavLink>
        ))}
      </nav>
      {/* A plain GET link that ends the session (N14). */}
      <a className="signout" href="/logout" data-scenario="N14">{t('Sign out')}</a>
    </header>
  );
}

export default function App() {
  const location = useLocation();
  const [summary, setSummary] = useState(null);
  const refresh = useCallback(() => {
    api('/api/summary').then(setSummary).catch(() => {});
  }, []);

  useEffect(applyTheme, []);
  useEffect(() => {
    if (location.pathname !== '/login') refresh();
  }, [location.pathname, location.search, refresh]);

  if (location.pathname === '/login') return <Login />;

  return (
    <SummaryContext.Provider value={{ summary, refresh }}>
      <Header summary={summary} />
      <Announcement />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<Product />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<Order />} />
          <Route path="/offers" element={<Offers />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/inbox/:id" element={<Message />} />
          <Route path="/todos" element={<Todos />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/support" element={<Support />} />
          <Route path="*" element={<h1>Page not found</h1>} />
        </Routes>
      </main>
    </SummaryContext.Provider>
  );
}
