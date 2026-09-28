import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Todos() {
  const [todos, setTodos] = useState(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/todos').then((d) => setTodos(d.todos));
  }, []);
  if (!todos) return <p>Loading…</p>;

  const run = async (path, opts) => {
    try {
      setError('');
      setTodos((await api(path, opts)).todos);
    } catch (e) {
      setError(e.message);
    }
  };
  const add = async (e) => {
    e.preventDefault();
    await run('/api/todos', { method: 'POST', body: { title }, scenario: 'T9' });
    setTitle('');
  };

  return (
    <>
      <h1>Todos</h1>
      <form onSubmit={add} className="row">
        <label>New todo <input value={title} onChange={(e) => setTitle(e.target.value)} data-scenario="T9" /></label>
        <button type="submit" data-scenario="T9">Add todo</button>
        <button type="button" onClick={() => run('/api/todos', { scenario: 'P9' })} data-scenario="P9">Reload list</button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      <ul className="todos">
        {todos.map((td) => (
          <li key={td.id} className="row">
            {/* A checkbox that saves immediately through PATCH (R7). */}
            <label className={td.done ? 'done' : ''}>
              <input type="checkbox" checked={td.done} data-scenario="R7"
                onChange={(e) => run(`/api/todos/${td.id}`, { method: 'PATCH', body: { done: e.target.checked }, scenario: 'R7' })} /> {td.title}
            </label>
            <button type="button" aria-label={`Delete ${td.title}`} data-scenario="T10"
              onClick={() => run(`/api/todos/${td.id}`, { method: 'DELETE', scenario: 'T10' })}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
