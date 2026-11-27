import { useCallback, useState } from 'react';

type InitialValue<T> = T | (() => T);

function resolveInitial<T>(initialValue: InitialValue<T>): T {
  return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
}

/**
 * React state that survives route unmount/remount for the current browser tab.
 * Removing a filter must be an explicit state update; navigation alone never
 * clears the saved value.
 */
export function useSessionState<T>(key: string, initialValue: InitialValue<T>) {
  const [value, setValueState] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(key);
      if (saved !== null) return JSON.parse(saved) as T;
    } catch {
      // Ignore unavailable storage or an obsolete/corrupt value.
    }
    return resolveInitial(initialValue);
  });

  const setValue: React.Dispatch<React.SetStateAction<T>> = useCallback(next => {
    setValueState(previous => {
      const resolved = typeof next === 'function'
        ? (next as (previous: T) => T)(previous)
        : next;
      try { sessionStorage.setItem(key, JSON.stringify(resolved)); } catch { /* ignore */ }
      return resolved;
    });
  }, [key]);

  return [value, setValue] as const;
}
