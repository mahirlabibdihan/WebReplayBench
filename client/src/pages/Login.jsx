import { useState } from 'react';
import { api } from '../api.js';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/login', { method: 'POST', body: { username, password } });
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.href = next && next.startsWith('/') ? next : '/';
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <main className="login">
      <h1>Sign in to Nimbus Market</h1>
      <form onSubmit={submit}>
        <label>Username <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>
        <label>Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
