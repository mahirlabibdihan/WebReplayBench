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

  // Explicit save of text that autosave already stored: a no-op PATCH (Q13).
  const saveNow = async () => {
    await api('/api/notes', { method: 'PATCH', body: { body }, scenario: 'Q13' });
    setStatus('Saved');
  };

  return (
    <>
      <h1>Notes</h1>
      <label className="block">Notes
        <textarea rows={8} value={body} data-scenario="R3"
          onChange={(e) => { setBody(e.target.value); setStatus('Saving…'); save(e.target.value); }} />
      </label>
      <div className="row">
        <button type="button" onClick={saveNow} data-scenario="Q13">Save now</button>
        <span role="status">{status || 'Changes save automatically.'}</span>
      </div>
    </>
  );
}
