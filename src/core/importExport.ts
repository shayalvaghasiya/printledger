// Import / export.
//
// - JSON export: a full backup (settings + presets + products + draft). Copy the
//   file to another device and import it there to move data desktop ↔ mobile.
// - CSV export: spreadsheet-friendly flat rows of the Products list. Import is
//   JSON-only (CSV can't faithfully restore the nested cost snapshot).

import type { AppState, Product } from './types';
import { STORAGE_KEY } from './presets';

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

/** Serialize the whole app state for backup / sharing. */
export function exportJSON(state: AppState): string {
  return JSON.stringify(
    {
      app: 'printledger',
      exportedAt: new Date().toISOString(),
      data: state,
    },
    null,
    2,
  );
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  data?: AppState;
}

/**
 * Parse + validate an imported JSON backup. Accepts both a raw `AppState` and
 * a previously-exported `{ app, data }` envelope.
 */
export function importJSON(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }

  const candidate = (parsed as { data?: AppState }).data ?? parsed;
  if (!isAppState(candidate)) {
    return {
      ok: false,
      error: 'This JSON is not a PrintLedger backup (missing settings/presets/products).',
    };
  }
  return { ok: true, data: candidate };
}

/** Structural validation of an `AppState` (version-aware, best-effort). */
export function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<AppState>;
  if (typeof v.version !== 'number' || v.version < 1) return false;
  if (!v.settings || typeof v.settings !== 'object') return false;
  if (!v.presets || typeof v.presets !== 'object') return false;
  if (!Array.isArray(v.products)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// CSV (export only)
// ---------------------------------------------------------------------------

/** Escape a CSV field per RFC 4180. */
export function csvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const CSV_HEADER = [
  'name',
  'sku',
  'category',
  'tags',
  'quantity',
  'currency',
  'unitCost',
  'batchTotal',
  'productionCost',
  'packagingCost',
  'targetMarginPct',
  'feePct',
  'price',
  'netPerUnit',
  'updatedAt',
];

export function productToCsvRow(p: Product): string {
  const b = p.snapshot.breakdown;
  const i = p.snapshot.input;
  return [
    p.name,
    p.sku,
    p.category,
    p.tags.join('; '),
    i.quantity,
    i.currency,
    b.unitTotal,
    b.batchTotal,
    b.productionCost,
    b.packagingCost,
    i.pricing.marginPct,
    i.pricing.feePct,
    b.price ?? '',
    b.netProfitPerUnit ?? '',
    p.updatedAt,
  ]
    .map(csvField)
    .join(',');
}

/** Build a full CSV document (header + one row per product). */
export function exportProductsCSV(products: Product[]): string {
  const rows = [CSV_HEADER.map(csvField).join(','), ...products.map(productToCsvRow)];
  return rows.join('\n');
}

export function downloadText(filename: string, text: string, mime: string): void {
  // Works in browsers and Electron renderer. Capacitor's WebView supports the
  // same APIs, and users on Android/iOS can also use the JSON/CSV copy buttons.
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { STORAGE_KEY };