import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatDuration,
  formatHoursMinutes,
  formatDate,
  currencyInfo,
} from '../core/format';

describe('formatMoney', () => {
  it('formats INR', () => {
    expect(formatMoney(1234.5, 'INR')).toContain('₹');
    expect(formatMoney(1234.5, 'INR')).toContain('1,234');
  });
  it('formats USD', () => {
    expect(formatMoney(12.5, 'USD')).toContain('$');
    expect(formatMoney(1230000.5, 'USD')).toContain('1,230,000');
  });
  it('handles null/undefined', () => {
    expect(formatMoney(null, 'USD')).toBe('—');
    expect(formatMoney(undefined, 'USD')).toBe('—');
  });
  it('handles unknown currency codes via generic fallback', () => {
    const out = formatMoney(9.99, 'ZZZ');
    expect(out).toContain('9.99');
  });
  it('JPY has zero decimals (Intl contract)', () => {
    expect(formatMoney(123.4, 'JPY')).not.toContain('.4');
  });
});

describe('currencyInfo', () => {
  it('returns metadata for known codes and a generic fallback for unknown', () => {
    expect(currencyInfo('INR').label).toBe('Indian Rupee');
    const unknown = currencyInfo('ZZZ');
    expect(unknown.code).toBe('ZZZ');
    expect(unknown.decimals).toBe(2);
  });
});

describe('formatNumber / percent / duration', () => {
  it('formats numbers and percents', () => {
    expect(formatNumber(1234.567, 2)).toBe('1,234.57');
    expect(formatPercent(0.05, 1)).toBe('0.1%');
    expect(formatPercent(10, 0)).toBe('10%');
  });
  it('formats durations', () => {
    expect(formatDuration(5025)).toBe('1 h 23 m 45 s');
    expect(formatDuration(60)).toBe('1 m');
    expect(formatDuration(0)).toBe('0 s');
  });
  it('formats hours + minutes', () => {
    expect(formatHoursMinutes(2, 30)).toBe('2 h 30 m');
    expect(formatHoursMinutes(0, 45)).toBe('45 min');
    expect(formatHoursMinutes(3, 0)).toBe('3 h');
  });
  it('formats dates', () => {
    const out = formatDate('2024-03-15T10:00:00.000Z');
    expect(out).toContain('2024');
    expect(formatDate('bad-date')).toBe('—');
  });
});