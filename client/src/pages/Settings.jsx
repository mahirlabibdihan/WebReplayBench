import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, getCookie } from '../api.js';
import { applyTheme } from '../App.jsx';

// Tabs are selected by the URL fragment only (H2).
const TABS = [['profile', 'Profile'], ['notifications', 'Notifications'], ['privacy', 'Privacy'], ['addresses', 'Addresses'], ['appearance', 'Appearance']];

export default function Settings() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = TABS.some(([k]) => `#${k}` === location.hash) ? location.hash.slice(1) : 'profile';
  const params = new URLSearchParams(location.search);
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [publicProfile, setPublicProfile] = useState(false);
  const [status, setStatus] = useState('');
  const [dark, setDark] = useState(localStorage.getItem('theme') === 'dark');
  const [lang, setLang] = useState(getCookie('lang') || 'en');
  const [newAddress, setNewAddress] = useState({ label: '', line: '' });

  const load = () => api('/api/settings').then((d) => {
    setData(d);
    setProfile(d.profile);
    setPublicProfile(d.settings.profile_public);
  });
  useEffect(() => {
    load();
  }, []);
  useEffect(() => setStatus(''), [tab]);
  if (!data) return <p>Loading…</p>;

  const saved = (msg) => { setStatus(msg); load(); };
  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      await api('/api/profile', { method: 'PUT', body: profile, scenario: 'T4' });
      saved('Profile saved.');
    } catch (err) {
      setStatus(err.message);
    }
  };
  const patchSetting = async (body) => {
    await api('/api/settings', { method: 'PATCH', body, scenario: 'R4' });
    saved('Preferences saved.');
  };
  const setSms = async (on) => {
    await api('/api/settings/sms', { method: 'PUT', body: { sms_alerts: on }, scenario: 'R5' });
    saved('Preferences saved.');
  };
  const savePrivacy = async () => {
    await api('/api/settings/privacy', { method: 'PUT', body: { profile_public: publicProfile }, scenario: 'T11' });
    saved('Privacy settings saved.');
  };
  const signOutEverywhere = async () => {
    await api('/api/logout', { method: 'POST', body: {}, scenario: 'T6' });
    window.location.href = '/login';
  };
  // PUT fired from a link (R8).
  const makeDefault = async (e, a) => {
    e.preventDefault();
    await api(`/api/addresses/${a.id}/default`, { method: 'PUT', body: {}, scenario: 'R8' });
    saved(`${a.label} is your default address.`);
  };
  // Subscription checkbox that saves immediately through PUT (R10).
  const setSubscribed = async (n, on) => {
    await api(`/api/newsletters/${n.list}`, { method: 'PUT', body: { subscribed: on }, scenario: 'R10' });
    saved(on ? `Subscribed to ${n.title}.` : `Unsubscribed from ${n.title}.`);
  };
  // Read-only POST (Q11), then a real POST (T15).
  const validateAddress = async () => {
    setStatus((await api('/api/addresses/validate', { method: 'POST', body: newAddress, scenario: 'Q11' })).message);
  };
  const addAddress = async (e) => {
    e.preventDefault();
    try {
      await api('/api/addresses', { method: 'POST', body: newAddress, scenario: 'T15' });
      setNewAddress({ label: '', line: '' });
      saved('Address added.');
    } catch (err) {
      setStatus(err.message);
    }
  };
  const toggleDark = (on) => {
    localStorage.setItem('theme', on ? 'dark' : 'light');
    setDark(on);
    applyTheme();
  };
  const changeLang = (value) => {
    document.cookie = `lang=${value}; path=/; max-age=31536000; samesite=lax`;
    setLang(value);
    window.location.reload();
  };
  const resetAppearance = () => {
    localStorage.removeItem('theme');
    localStorage.removeItem('dismissed_announcements');
    localStorage.removeItem('hide_recently_viewed');
    document.cookie = 'lang=; path=/; max-age=0';
    window.location.reload();
  };

  return (
    <>
      <h1>Settings</h1>
      <nav aria-label="Settings sections" className="row tabs">
        {TABS.map(([k, label]) => (
          <a key={k} href={`#${k}`} aria-current={tab === k ? 'page' : undefined} data-scenario="S5"
            onClick={(e) => { e.preventDefault(); navigate({ search: location.search, hash: k }); }}>
            {label}
          </a>
        ))}
      </nav>
      {params.get('unsubscribed') && <p role="status" className="toast">You have been unsubscribed from {params.get('unsubscribed')}.</p>}
      {status && <p role="status" className="toast">{status}</p>}

      {tab === 'profile' && (
        <form onSubmit={saveProfile} aria-label="Profile" className="panel">
          <label className="block">Full name <input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} /></label>
          <label className="block">Email <input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></label>
          <label className="block">Phone <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label>
          <button type="submit" data-scenario="T4">Save profile</button>
        </form>
      )}

      {tab === 'notifications' && (
        <section aria-label="Notifications" className="panel">
          <label className="block">Email digest{' '}
            <select value={data.settings.email_digest} onChange={(e) => patchSetting({ email_digest: e.target.value })} data-scenario="R4">
              <option value="off">Off</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly digest</option>
            </select>
          </label>
          <label className="block">
            <input type="checkbox" checked={data.settings.sms_alerts} onChange={(e) => setSms(e.target.checked)} data-scenario="R5" /> SMS alerts
          </label>
          <label className="block">Products per page{' '}
            <select value={data.settings.items_per_page} onChange={(e) => patchSetting({ items_per_page: Number(e.target.value) })} data-scenario="R4">
              {[6, 12, 24].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <p><small>Changes on this tab are saved automatically.</small></p>
        </section>
      )}

      {tab === 'privacy' && (
        <section aria-label="Privacy" className="panel">
          <label className="block">
            <input type="checkbox" checked={publicProfile} onChange={(e) => setPublicProfile(e.target.checked)} /> Public profile
          </label>
          <button type="button" onClick={savePrivacy} data-scenario="T11">Save privacy</button>
          <h2>Newsletters</h2>
          <ul>
            {data.newsletters.map((n) => (
              <li key={n.list} className="row">
                <label>
                  <input type="checkbox" checked={n.subscribed} onChange={(e) => setSubscribed(n, e.target.checked)} data-scenario="R10" /> {n.title} emails
                </label>
                {n.subscribed && <a href={`/unsubscribe?list=${n.list}`} data-scenario="N5">Unsubscribe from {n.title}</a>}
              </li>
            ))}
          </ul>
          <h2>Sessions</h2>
          <button type="button" onClick={signOutEverywhere} data-scenario="T6">Sign out everywhere</button>
        </section>
      )}

      {tab === 'addresses' && (
        <section aria-label="Addresses" className="panel">
          {params.get('removed') && <p role="status">Address list updated.</p>}
          <ul>
            {data.addresses.map((a) => (
              <li key={a.id}>
                <strong>{a.label}</strong>{a.is_default ? ' (default)' : ''}: {a.line}{' '}
                <a href="#" onClick={(e) => makeDefault(e, a)} data-scenario="R8">Set {a.label} as default</a>{' · '}
                {/* Delete through a plain GET link carrying a token (N15). */}
                <a href={`/addresses/${a.id}/remove?token=${a.removeToken}`} data-scenario="N15">Remove {a.label} address</a>
              </li>
            ))}
          </ul>
          <p><small>Addresses used by past orders are kept.</small></p>
          <form onSubmit={addAddress} aria-label="Add an address">
            <h2>Add an address</h2>
            <label className="block">Label <input value={newAddress.label} onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })} /></label>
            <label className="block">Address <input value={newAddress.line} onChange={(e) => setNewAddress({ ...newAddress, line: e.target.value })} /></label>
            <div className="row">
              <button type="button" onClick={validateAddress} data-scenario="Q11">Validate address</button>
              <button type="submit" data-scenario="T15">Add address</button>
            </div>
          </form>
        </section>
      )}

      {tab === 'appearance' && (
        <section aria-label="Appearance" className="panel">
          <label className="block">
            <input type="checkbox" checked={dark} onChange={(e) => toggleDark(e.target.checked)} data-scenario="C1" /> Dark mode
          </label>
          <label className="block">Language{' '}
            <select value={lang} onChange={(e) => changeLang(e.target.value)} data-scenario="C3">
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
          <button type="button" onClick={resetAppearance} data-scenario="C4">Reset appearance</button>
        </section>
      )}
    </>
  );
}
