import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useSummary } from '../App.jsx';
import { useDebouncedCallback } from '../hooks.js';
import { StarLink } from './Inbox.jsx';

export default function Message() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useSummary();
  const [m, setM] = useState(null);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');

  const load = () =>
    // This GET also marks the message read (N3).
    api(`/api/messages/${id}`).then((d) => {
      setM(d);
      if (d.draft) {
        setText(d.draft);
        setComposing(true);
      }
      refresh();
    }).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [id]);

  // Draft autosave through a GET with the text in the query string (N8).
  const saveDraft = useDebouncedCallback(async (body) => {
    await api(`/api/drafts/save?message=${id}&body=${encodeURIComponent(body)}`, { scenario: 'N8' });
    setDraftStatus('Draft saved');
  }, 400);

  if (error) return <p role="alert">{error}</p>;
  if (!m) return <p>Loading…</p>;

  const remove = async () => {
    if (!window.confirm('Delete this message?')) return;
    await api(`/api/messages/${m.id}`, { method: 'DELETE', scenario: 'T7' });
    refresh();
    navigate('/inbox');
  };
  // A button whose request is a GET that writes (N17).
  const snooze = async () => {
    await api(`/api/messages/${m.id}/snooze`, { scenario: 'N17' });
    setM({ ...m, is_snoozed: true });
  };
  const showPreview = async () => {
    setPreview((await api('/api/preview', { method: 'POST', body: { markdown: text }, scenario: 'Q2' })).html);
  };
  // DELETE that is a no-op when nothing was saved yet (T12 / Q7).
  const discard = async () => {
    const res = await api(`/api/drafts/${m.id}`, { method: 'DELETE', scenario: 'T12' });
    setText('');
    setPreview('');
    setDraftStatus(res.deleted ? 'Draft discarded' : 'Nothing to discard');
  };
  const send = async () => {
    try {
      await api(`/api/messages/${m.id}/reply`, { method: 'POST', body: { body: text }, scenario: 'T8' });
      setText('');
      setPreview('');
      setComposing(false);
      setStatus('Reply sent.');
      load();
    } catch (e) {
      setStatus(e.message);
    }
  };

  return (
    <article>
      <p><Link to={m.folder === 'archive' ? '/inbox?folder=archive' : '/inbox'} data-scenario="S5">← Back to {m.folder}</Link></p>
      <h1>{m.subject}</h1>
      <p>From <strong>{m.sender}</strong> · {m.sent_at} · <StarLink message={m} onChange={(s) => setM({ ...m, is_starred: s })} /></p>
      <p className="body">{m.body}</p>
      {m.unsubscribe && (
        <p><a href={`/unsubscribe?list=${m.unsubscribe.list}`} data-scenario="N5">Unsubscribe from {m.unsubscribe.title}</a></p>
      )}
      {m.replies.length > 0 && (
        <section aria-label="Your replies">
          <h2>Your replies</h2>
          <ul>{m.replies.map((r) => <li key={r.id}>{r.body}</li>)}</ul>
        </section>
      )}
      {status && <p role="status" className="toast">{status}</p>}
      <div className="row">
        <button type="button" onClick={() => setComposing(true)} data-scenario="P5">Reply</button>
        <button type="button" onClick={snooze} disabled={m.is_snoozed} data-scenario="N17">{m.is_snoozed ? 'Snoozed' : 'Snooze'}</button>
        <button type="button" onClick={remove} data-scenario="T7">Delete</button>
      </div>
      {composing && (
        <section aria-label="Reply" className="panel">
          <label className="block">Reply text
            <textarea rows={4} value={text} data-scenario="N8"
              onChange={(e) => { setText(e.target.value); setDraftStatus('Saving draft…'); saveDraft(e.target.value); }} />
          </label>
          {draftStatus && <small>{draftStatus}</small>}
          <div className="row">
            <button type="button" onClick={showPreview} data-scenario="Q2">Preview</button>
            <button type="button" onClick={send} data-scenario="T8">Send reply</button>
            <button type="button" onClick={discard} data-scenario="T12">Discard draft</button>
          </div>
          {/* eslint-disable-next-line react/no-danger */}
          {preview && <div className="preview" aria-label="Preview" dangerouslySetInnerHTML={{ __html: preview }} />}
        </section>
      )}
    </article>
  );
}
