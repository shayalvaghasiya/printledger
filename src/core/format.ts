// Currency formatting. Uses the platform Intl implementation (Node ≥ 13 and all
// modern browsers ship full ICU, so INR/USD/EUR/etc. all format correctly).
// Numbers are kept unrounded in the engine; rounding happens here at the edge.

export interface CurrencyInfo {
  code: string;
  label: string;
  locale: string;
  symbol: string;
  decimals: number;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', label: 'US Dollar', locale: 'en-US', symbol: '$', decimals: 2 },
  { code: 'INR', label: 'Indian Rupee', locale: 'en-IN', symbol: '₹', decimals: 2 },
  { code: 'EUR', label: 'Euro', locale: 'de-DE', symbol: '€', decimals: 2 },
  { code: 'GBP', label: 'British Pound', locale: 'en-GB', symbol: '£', decimals: 2 },
  { code: 'JPY', label: 'Japanese Yen', locale: 'ja-JP', symbol: '¥', decimals: 0 },
  { code: 'AUD', label: 'Australian Dollar', locale: 'en-AU', symbol: 'A$', decimals: 2 },
  { code: 'CAD', label: 'Canadian Dollar', locale: 'en-CA', symbol: 'C$', decimals: 2 },
  { code: 'CNY', label: 'Chinese Yuan', locale: 'zh-CN', symbol: '¥', decimals: 2 },
  { code: 'CHF', label: 'Swiss Franc', locale: 'de-CH', symbol: 'Fr', decimals: 2 },
  { code: 'SGD', label: 'Singapore Dollar', locale: 'en-SG', symbol: 'S$', decimals: 2 },
  { code: 'NZD', label: 'New Zealand Dollar', locale: 'en-NZ', symbol: 'NZ$', decimals: 2 },
  { code: 'BRL', label: 'Brazilian Real', locale: 'pt-BR', symbol: 'R$', decimals: 2 },
  { code: 'MXN', label: 'Mexican Peso', locale: 'es-MX', symbol: 'MX$', decimals: 2 },
  { code: 'ZAR', label: 'South African Rand', locale: 'en-ZA', symbol: 'R', decimals: 2 },
  { code: 'AED', label: 'UAE Dirham', locale: 'ar-AE', symbol: 'د.إ', decimals: 2 },
  { code: 'PLN', label: 'Polish Złoty', locale: 'pl-PL', symbol: 'zł', decimals: 2 },
  { code: 'SEK', label: 'Swedish Krona', locale: 'sv-SE', symbol: 'kr', decimals: 2 },
  { code: 'NOK', label: 'Norwegian Krone', locale: 'nb-NO', symbol: 'kr', decimals: 2 },
  { code: 'DKK', label: 'Danish Krone', locale: 'da-DK', symbol: 'kr', decimals: 2 },
  { code: 'CZK', label: 'Czech Koruna', locale: 'cs-CZ', symbol: 'Kč', decimals: 2 },
  { code: 'HUF', label: 'Hungarian Forint', locale: 'hu-HU', symbol: 'Ft', decimals: 0 },
  { code: 'TRY', label: 'Turkish Lira', locale: 'tr-TR', symbol: '₺', decimals: 2 },
];

/** ISO code → formatting info. Falls back to USD-styled generic values. */
export function currencyInfo(code: string): CurrencyInfo {
  const found = CURRENCIES.find((c) => c.code === code);
  return found ?? { code, label: code, locale: 'en-US', symbol: '$', decimals: 2 };
}

/**
 * Format a number as money in the given currency. `null`/`undefined` render as
 * `—`. Uses `Intl.NumberFormat` when Intl supports the code, otherwise falls
 * back to a symbol-prefixed number.
 */
export function formatMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || !isFinite(value)) return '—';
  const info = currencyInfo(currency);
  try {
    // `style: 'currency'` on a code Intl doesn't know throws — catch and fallback.
    const nf = new Intl.NumberFormat(info.locale, {
      style: 'currency',
      currency: info.code,
      minimumFractionDigits: info.decimals,
      maximumFractionDigits: info.decimals,
    });
    return nf.format(value);
  } catch {
    const rounded = info.decimals === 0 ? String(Math.round(value)) : value.toFixed(info.decimals);
    return `${info.symbol}${rounded}`;
  }
}

/** Plain number with thousands separators (for ratios, grams, watts, etc.). */
export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !isFinite(value)) return '—';
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)}%`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Human-readable duration like "2 h 30 m" from hours + minutes. */
export function formatHoursMinutes(hours: number, minutes: number): string {
  const totalMin = Math.round(hours * 60 + minutes);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} m`;
}

/** Human-readable "1 h 23 m 45 s" from a seconds integer/float. */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} d`);
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} m`);
  if (s || parts.length === 0) parts.push(`${s} s`);
  return parts.join(' ');
}