// Responsive app shell: sidebar navigation on desktop, bottom tab bar on mobile,
// top app bar with currency + theme quick controls.

import type { ReactNode } from 'react';
import type { CurrencyCode, ThemeSetting } from '../core/types';
import { currencyInfo } from '../core/format';
import {
  IconCalculator,
  IconBoxes,
  IconSparkles,
  IconSettings,
  IconSun,
  IconMoon,
  IconPrinter3d,
} from './icons';

export type TabId = 'calculator' | 'products' | 'presets' | 'settings';

const NAV: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'calculator', label: 'Calculator', icon: <IconCalculator size={20} /> },
  { id: 'products', label: 'Products', icon: <IconBoxes size={20} /> },
  { id: 'presets', label: 'Libraries', icon: <IconSparkles size={20} /> },
  { id: 'settings', label: 'Settings', icon: <IconSettings size={20} /> },
];

function ThemeToggle({
  theme,
  onChange,
}: {
  theme: ThemeSetting;
  onChange: (t: ThemeSetting) => void;
}) {
  const next: ThemeSetting = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="btn-icon theme-toggle"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => onChange(next)}
    >
      {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
    </button>
  );
}

export function AppShell({
  tab,
  onTab,
  theme,
  onTheme,
  currency,
  onCurrency,
  children,
}: {
  tab: TabId;
  onTab: (t: TabId) => void;
  theme: ThemeSetting;
  onTheme: (t: ThemeSetting) => void;
  currency: CurrencyCode;
  onCurrency: (c: CurrencyCode) => void;
  children: ReactNode;
}) {
  const wrap = (c: CurrencyCode) => `[${currencyInfo(c).label}] ${c}`;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><IconPrinter3d size={22} /></span>
          <span className="brand-text">
            <strong>PrintLedger</strong>
            <small>Cost &amp; Production Studio</small>
          </span>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => onTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <select
            className="currency-select"
            value={currency}
            onChange={(e) => onCurrency(e.target.value as CurrencyCode)}
            aria-label="Display currency"
            title="Display currency"
          >
            <option value="USD" title="US Dollar">$ USD</option>
            <option value="INR" title="Indian Rupee">₹ INR</option>
            <option value="EUR" title="Euro">€ EUR</option>
            <option value="GBP" title="British Pound">£ GBP</option>
            <option value="JPY" title="Japanese Yen">¥ JPY</option>
          </select>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            {NAV.find((n) => n.id === tab)?.label ?? 'PrintLedger'}
            <span className="topbar-sub">{currency ? wrap(currency) : ''}</span>
          </div>
          <div className="topbar-actions">
            <ThemeToggle theme={theme} onChange={onTheme} />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="tabbar" aria-label="Primary">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tabbar-item ${tab === item.id ? 'active' : ''}`}
            onClick={() => onTab(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}