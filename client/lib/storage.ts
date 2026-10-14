/**
 * Storage Utilities for localStorage
 * 
 * This module provides React hooks for subscribing to localStorage changes.
 * It's kept as a utility for performance-critical scenarios where localStorage
 * provides immediate updates (e.g., workspace state, active project selection).
 * 
 * NOTE: Most data operations should use the API backend (see lib/api.ts).
 * Only use localStorage for:
 * - Auth tokens (client-side authentication)
 * - Session preferences (active project ID, UI state)
 * - Performance-critical data with API backup (workspace state)
 */

import { useMemo, useSyncExternalStore } from "react";

export const CHANGE_EVENT = "nuvora:storage";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}

/** Subscribes to a localStorage key and returns its parsed value (or null). */
export function useLocalValue<T>(key: string | null): T | null {
  const raw = useSyncExternalStore(
    subscribe,
    () => (key ? window.localStorage.getItem(key) : null),
    () => null,
  );

  return useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }, [raw]);
}

/** Call after every write so same-tab subscribers update. */
export function notifyChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
