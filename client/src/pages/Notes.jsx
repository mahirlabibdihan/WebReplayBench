import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useDebouncedCallback } from '../hooks.js';

export default function Notes() {
  const [body, setBody] = useState(null);
  const [status, setStatus] = useState('');
  useEffect(() => {
    api('/api/notes').then((d) => setBody(d.body));
  }, []);

  // Autosave with a debounced PATCH (R3).
  const save = useDebouncedCallback(async (text) => {
    await api('/api/notes', { method: 'PATCH', body: { body: text }, scenario: 'R3' });
    setStatus('All changes saved');
  }, 400);

  if (body === null) return <p>Loading…</p>;
  return (
    <>
      <h1>Notes</h1>
      <label className="block">Notes
        <textarea rows={8} value={body} data-scenario="R3"
          onChange={(e) => { setBody(e.target.value); setStatus('Saving…'); save(e.target.value); }} />
      </label>
      <p role="status">{status || 'Changes save automatically.'}</p>
    </>
  );
}
