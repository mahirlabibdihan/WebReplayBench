import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useSummary } from '../App.jsx';

/** Star toggle through a GET (N2). Replaying it would undo it (H5). */
export function StarLink({ message, onChange }) {
  const toggle = async (e) => {
    e.preventDefault();
    const res = await api(`/api/messages/${message.id}/toggle-star`, { scenario: 'N2' });
    onChange(res.is_starred);
  };
  return (
    <a href="#" onClick={toggle} data-scenario="N2">
      <span aria-hidden="true">{message.is_starred ? '★ ' : '☆ '}</span>{message.is_starred ? 'Starred' : 'Star'}
    </a>
  );
}

function RowMenu({ message, onDone }) {
  const [open, setOpen] = useState(false);
  const run = async (fn) => {
    setOpen(false);
    await fn();
    onDone();
  };
  return (
    <span className="menu-wrap">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-scenario="S2"
        aria-label={`More actions for ${message.subject}`}>
        More actions
      </button>
      {open && (
        <span role="menu" className="menu" aria-label={`Actions for ${message.subject}`}>
          {/* Menu items (role=menuitem), not buttons: Archive POSTs, Mark as unread PATCHes. */}
          <button type="button" role="menuitem" data-scenario="N10"
            onClick={() => run(() => api(`/api/messages/${message.id}/archive`, { method: 'POST', body: {}, scenario: 'N10' }))}>
            Archive
          </button>
          <button type="button" role="menuitem" data-scenario="R6"
            onClick={() => run(() => api(`/api/messages/${message.id}`, { method: 'PATCH', body: { is_read: false }, scenario: 'R6' }))}>
            Mark as unread
          </button>
          <button type="button" role="menuitem" data-scenario="R11"
            onClick={() => run(() => api(`/api/messages/${message.id}`, { method: 'DELETE', scenario: 'R11' }))}>
            Delete
          </button>
        </span>
      )}
    </span>
  );
}

export default function Inbox() {
  const [params] = useSearchParams();
  const { refresh } = useSummary();
  const folder = params.get('folder') === 'archive' ? 'archive' : 'inbox';
  const [messages, setMessages] = useState(null);
  const [order, setOrder] = useState('newest');
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const load = (q = activeSearch) =>
    api(`/api/messages?folder=${folder}${q ? `&q=${encodeURIComponent(q)}` : ''}`, { scenario: q ? 'P12' : undefined })
      .then((d) => setMessages(d.messages));
  useEffect(() => {
    load();
  }, [folder]);
  if (!messages) return <p>Loading…</p>;

  const runSearch = (e) => {
    e.preventDefault();
    setActiveSearch(search);
    load(search);
  };
  const shown = order === 'newest' ? messages : [...messages].reverse();

  const reload = () => {
    load();
    refresh();
  };
  // Delete through a link that issues a DELETE (R1).
  const del = async (e, m) => {
    e.preventDefault();
    await api(`/api/messages/${m.id}`, { method: 'DELETE', scenario: 'R1' });
    reload();
  };

  // A button whose request is a GET that writes (N16).
  const markAllRead = async () => {
    await api('/api/messages/mark-all-read', { scenario: 'N16' });
    reload();
  };

  return (
    <>
      <h1>{folder === 'archive' ? 'Archive' : 'Inbox'}</h1>
      <nav aria-label="Folders" className="row">
        <Link to="/inbox" aria-current={folder === 'inbox' ? 'page' : undefined} data-scenario="S5">Inbox</Link>
        <Link to="/inbox?folder=archive" aria-current={folder === 'archive' ? 'page' : undefined} data-scenario="S5">Archive</Link>
        {folder === 'inbox' && <button type="button" onClick={markAllRead} data-scenario="N16">Mark all as read</button>}
      </nav>
      <div className="row">
        <form role="search" onSubmit={runSearch}>
          <input type="search" aria-label="Search messages" placeholder="Search messages" value={search}
            onChange={(e) => setSearch(e.target.value)} data-scenario="P12" />
        </form>
        <label>Sort{' '}
          <select value={order} onChange={(e) => setOrder(e.target.value)} data-scenario="S10">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>
      {messages.length === 0 && <p>No messages.</p>}
      <ul className="messages">
        {shown.map((m) => (
          <li key={m.id} className={m.is_read ? 'read' : 'unread'}>
            <StarLink message={m} onChange={(s) => setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, is_starred: s } : x)))} />
            <span className="sender">{m.sender}</span>
            {/* Opening a message marks it read (N3). */}
            <Link to={`/inbox/${m.id}`} data-scenario="N3">{m.subject}</Link>
            {!m.is_read && <span className="badge">Unread</span>}
            <span className="date">{m.sent_at}</span>
            <a href="#" onClick={(e) => del(e, m)} data-scenario="R1">Delete</a>
            <RowMenu message={m} onDone={reload} />
          </li>
        ))}
      </ul>
    </>
  );
}
