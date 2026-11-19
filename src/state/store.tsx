// PrintLedger store: a single persisted Reducer store.
//
// Everything the app knows — settings, presets, products, and the live
// calculator draft — lives in one tree, is serialized to IndexedDB after every
// change (debounced), and is restored on launch. This keeps the app fully
// offline-first and makes "Recalculate with Current Rates" and history
// straightforward: nothing needs a server or a migration map.

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  type ReactNode,
  type Dispatch,
} from 'react';
import type {
  AppState,
  CostInput,
  Presets,
  Product,
  ProductRevision,
} from '../core/types';
import { computeBreakdown, resolveDraftInput, computeRecalcDeltas, uid } from '../core/costEngine';
import { makeEmptyState, STORAGE_KEY, createEmptyDraft } from '../core/presets';
import { loadState, writeState } from '../core/storage';
import { isAppState } from '../core/importExport';

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export type PresetCollection = keyof Presets;

export type Action =
  | { type: 'settings/update'; patch: Partial<AppState['settings']> }
  | { type: 'draft/patch'; path: ReadonlyArray<string | number>; value: unknown }
  | { type: 'draft/load'; draft: CostInput }
  | { type: 'preset/add'; collection: PresetCollection; item: Presets[PresetCollection][number] }
  | { type: 'preset/update'; collection: PresetCollection; id: string; patch: Partial<Presets[PresetCollection][number]> }
  | { type: 'preset/delete'; collection: PresetCollection; id: string }
  | { type: 'preset/deduct'; deductions: { spoolId: string; grams: number }[] }
  | {
      type: 'product/save';
      id?: string;
      draft: CostInput;
      meta: { name: string; sku: string; category: string; tags: string[]; notes: string };
      mode: 'new' | 'overwrite' | 'version';
      note?: string;
    }
  | { type: 'product/delete'; id: string }
  | { type: 'product/duplicate'; id: string }
  | { type: 'data/load'; state: AppState }
  | { type: 'data/reset' };

// ---------------------------------------------------------------------------
// Immutable deep helpers (for draft path updates)
// ---------------------------------------------------------------------------

export function updateIn<T>(obj: T, path: ReadonlyArray<string | number>, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const isArr = Array.isArray(obj);
  const base: any = isArr ? [...(obj as unknown[])] : { ...(obj as object) };
  const child = (obj as any)?.[head];
  base[head] = rest.length ? updateIn(child, rest, value) : value;
  return base as T;
}

export function getIn(obj: unknown, path: ReadonlyArray<string | number>): unknown {
  let cur: any = obj;
  for (const key of path) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[key];
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Reducer helpers (pure)
// ---------------------------------------------------------------------------

const HISTORY_LIMIT = 40;

function pushHistory(hist: ProductRevision[], snap: Product['snapshot'], note: string): ProductRevision[] {
  return [{ id: uid('rv'), at: new Date().toISOString(), note, snapshot: snap }, ...hist].slice(
    0,
    HISTORY_LIMIT,
  );
}

function applyDeductions(state: AppState, deductions: { spoolId: string; grams: number }[]): AppState {
  if (deductions.length === 0) return state;
  const filaments = state.presets.filaments.map((f) => {
    const d = deductions.find((x) => x.spoolId === f.id);
    if (!d || !f.trackRemaining || f.remainingGrams === null) return f;
    const remaining = Math.max(0, Math.round((f.remainingGrams - d.grams) * 10) / 10);
    return { ...f, remainingGrams: remaining };
  });
  return { ...state, presets: { ...state.presets, filaments } };
}

const presetsByCollection = (s: AppState, c: PresetCollection) => s.presets[c];

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'draft/patch':
      return { ...state, draft: updateIn(state.draft, action.path, action.value) };
    case 'draft/load':
      return { ...state, draft: action.draft };
    case 'preset/add':
      return {
        ...state,
        presets: {
          ...state.presets,
          [action.collection]: [...presetsByCollection(state, action.collection), action.item],
        },
      };
    case 'preset/update': {
      const list = (presetsByCollection(state, action.collection) as Array<{ id: string } & object>).map(
        (item) => (item.id === action.id ? { ...item, ...action.patch } : item),
      );
      return { ...state, presets: { ...state.presets, [action.collection]: list } };
    }
    case 'preset/delete':
      return {
        ...state,
        presets: {
          ...state.presets,
          [action.collection]: presetsByCollection(state, action.collection).filter(
            (item: any) => item.id !== action.id,
          ),
        },
      };
    case 'preset/deduct':
      return applyDeductions(state, action.deductions);

    case 'product/save': {
      const breakdown = computeBreakdown(action.draft);
      const snapshot = { input: action.draft, breakdown, computedAt: new Date().toISOString() };
      const meta = action.meta;
      const now = new Date().toISOString();

      if (action.id) {
        const existing = state.products.find((p) => p.id === action.id);
        if (!existing) return state;
        const history =
          action.mode === 'version' ? pushHistory(existing.history, existing.snapshot, action.note?.trim() || 'Updated') : existing.history;
        return {
          ...state,
          products: state.products.map((p) =>
            p.id === action.id
              ? {
                  ...p,
                  ...meta,
                  snapshot,
                  history,
                  updatedAt: now,
                }
              : p,
          ),
        };
      }

      const product: Product = {
        id: uid('prod'),
        ...meta,
        createdAt: now,
        updatedAt: now,
        snapshot,
        history: [],
      };
      return { ...state, products: [product, ...state.products] };
    }

    case 'product/delete':
      return { ...state, products: state.products.filter((p) => p.id !== action.id) };
    case 'product/duplicate': {
      const src = state.products.find((p) => p.id === action.id);
      if (!src) return state;
      const now = new Date().toISOString();
      const copy: Product = {
        ...src,
        id: uid('prod'),
        name: `${src.name} (copy)`,
        createdAt: now,
        updatedAt: now,
        history: [],
      };
      return { ...state, products: [copy, ...state.products] };
    }

    case 'data/load':
      return action.state;
    case 'data/reset':
      return makeEmptyState();
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Selectors / plan helpers
// ---------------------------------------------------------------------------

/** Per-filament spool deduction plan for a batch (used on save). */
export function planDeductions(presets: Presets, draft: CostInput, quantity: number) {
  const q = Math.max(0, quantity);
  const out: { spoolId: string; grams: number; name: string; remainingAfter: number }[] = [];
  for (const line of draft.filament) {
    if (line.source !== 'preset' || !line.spoolId) continue;
    const spool = presets.filaments.find((f) => f.id === line.spoolId);
    if (!spool || !spool.trackRemaining || spool.remainingGrams === null) continue;
    const grams = line.usedGrams * q;
    const remainingAfter = Math.max(0, spool.remainingGrams - grams);
    out.push({ spoolId: spool.id, name: spool.name, grams, remainingAfter });
  }
  return out;
}

/** Compute the "Recalculate with Current Rates" delta for a product. */
export function computeRecalc(
  state: AppState,
  productId: string,
): { oldInput: CostInput; newInput: CostInput; deltas: ReturnType<typeof computeRecalcDeltas> } | null {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return null;
  const oldInput = product.snapshot.input;
  const newInput = resolveDraftInput(oldInput, state.presets, state.settings.kwhRate);
  const deltas = computeRecalcDeltas(oldInput, state.settings.kwhRate, state.presets);
  return { oldInput, newInput, deltas };
}

/** Current per-unit total for a product in currency-appropriate display. */
export function productUnitTotal(p: Product): number {
  return p.snapshot.breakdown.unitTotal;
}

// ---------------------------------------------------------------------------
// Context & provider
// ---------------------------------------------------------------------------

const StoreContext = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null);

const DEBOUNCE_MS = 350;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, makeEmptyState);
  const [ready, setReady] = useState(false);

  // Hydrate from storage once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadState<AppState>(STORAGE_KEY);
      if (cancelled) return;
      if (stored && isAppState(stored)) dispatch({ type: 'data/load', state: stored });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist (debounced) after every change.
  useEffect(() => {
    if (!ready) return; // don't overwrite stored data with an empty state before hydration
    const timer = setTimeout(() => {
      writeState(STORAGE_KEY, JSON.stringify(state)).catch(() => {
        /* storage unavailable — app still works in-memory */
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, ready]);

  if (!ready) {
    return <div className="splash">Loading PrintLedger…</div>;
  }

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore(): { state: AppState; dispatch: Dispatch<Action> } {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

/** Convenience: fresh empty draft honoring current settings. */
export function freshDraft(state: AppState): CostInput {
  return createEmptyDraft(state.settings);
}