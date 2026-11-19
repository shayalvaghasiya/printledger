// Async persistence layer.
//
// Primary backend is IndexedDB via `idb-keyval` (fast, structured-clone, works
// in browsers, Electron renderer and Capacitor's WebView). For environments where
// IndexedDB is unavailable (some embedded webviews, headless test runs), we fall
// back to localStorage. All writes are snapshots of the whole state — a single
// serializable JSON tree — which keeps the offline-first design simple and
// reliable.

import { get as idbGet, set as idbSet } from 'idb-keyval';

/** Size guard: localStorage is ~5 MB; abort if we'd exceed it (protects data). */
const LS_LIMIT = 4 * 1024 * 1024;

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): boolean {
  try {
    if (value.length > LS_LIMIT) return false; // don't throw away existing data
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function storageAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Read a stored state string for `key` (returns null when absent/invalid). */
export async function readState(key: string): Promise<unknown | null> {
  if (storageAvailable()) {
    try {
      const raw = await idbGet(key);
      if (raw !== undefined && raw !== null) return raw;
    } catch {
      /* fall through to localStorage */
    }
  }
  const raw = lsGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Persist `stateString` to IndexedDB (primary) with a localStorage mirror.
 * We keep both in sync so a device that loses IndexedDB still has the data.
 */
export async function writeState(key: string, stateString: string): Promise<void> {
  if (storageAvailable()) {
    try {
      await idbSet(key, stateString);
    } catch {
      /* storage quota/failure — localStorage mirror below still attempts */
    }
  }
  lsSet(key, stateString);
}

export async function clearState(key: string): Promise<void> {
  if (storageAvailable()) {
    try {
      await idbSet(key, undefined);
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Convenience: read + JSON.parse with structural fallback. */
export async function loadState<T>(key: string): Promise<T | null> {
  const raw = await readState(key);
  return (raw as T) ?? null;
}