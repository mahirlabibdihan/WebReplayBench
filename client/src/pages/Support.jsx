import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

// A classic server-handled form: native POST, then a 303 redirect back (T5).
export default function Support() {
  const [params] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  useEffect(() => {
    api('/api/support/tickets').then((d) => setTickets(d.tickets));
  }, [params.toString()]);

  return (
    <>
      <h1>Support</h1>
      {params.get('submitted') && <p role="status" className="toast">Ticket #{params.get('submitted')} submitted. We will reply by email.</p>}
      {params.get('error') && <p role="alert" className="error">Please fill in both the subject and the message.</p>}
      <form method="post" action="/support/tickets" className="panel">
        <label className="block">Topic{' '}
          <select name="topic" defaultValue="order">
            <option value="order">Order issue</option>
            <option value="account">Account</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block">Subject <input name="subject" /></label>
        <label className="block">Message <textarea name="body" rows={4} /></label>
        <button type="submit" data-scenario="T5">Submit ticket</button>
      </form>
      {tickets.length > 0 && (
        <section aria-label="Your tickets">
          <h2>Your tickets</h2>
          <ul>{tickets.map((t) => <li key={t.id}>#{t.id} [{t.topic}] {t.subject}</li>)}</ul>
        </section>
      )}
    </>
  );
}
