import { useEffect, useRef } from 'react';

/** Debounced callback that survives re-renders (used by the autosave fields). */
export function useDebouncedCallback(fn, ms) {
  const timer = useRef();
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => () => clearTimeout(timer.current), []);
  return (...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(...args), ms);
  };
}
