// Settings screen — currency & theme, data export/import, reset.

import { useRef, useState } from 'react';
import type { CurrencyCode } from '../core/types';
import { CURRENCIES, formatMoney } from '../core/format';
import { exportJSON, importJSON, exportProductsCSV, downloadText } from '../core/importExport';
import { useStore } from '../state/store';
import { Button, SelectField, Modal, Warning, Hint, EmptyState } from '../ui/controls';
import { IconDownload, IconUpload, IconRefresh, IconMoon, IconSun, IconSparkles } from '../ui/icons';

export function SettingsScreen() {
  const { state, dispatch } = useStore();
  const [importResult, setImportResult] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const theme = state.settings.theme;

  return (
    <div>
      <div className="page-head">
        <h1>Settings</h1>
        <p className="muted">Everything is stored locally on this device — backups move data between devices.</p>
      </div>

      <section className="card">
        <h2>Appearance & currency</h2>
        <div className="field-grid two">
          <SelectField
            label="Currency"
            id="set-currency"
            value={state.settings.currency}
            onChange={(e) => dispatch({ type: 'settings/update', patch: { currency: e.target.value as CurrencyCode } })}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
            ))}
          </SelectField>
          <div className="field">
            <span className="field-label">Theme</span>
            <div className="seg">
              <button
                type="button"
                className={`seg-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'settings/update', patch: { theme: 'light' } })}
              >
                <IconSun size={15} /> Light
              </button>
              <button
                type="button"
                className={`seg-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'settings/update', patch: { theme: 'dark' } })}
              >
                <IconMoon size={15} /> Dark
              </button>
            </div>
          </div>
        </div>
        <p className="muted small">
          Sample formatting: {formatMoney(1234.5, state.settings.currency)}
        </p>
      </section>

      <section className="card">
        <h2>Data</h2>
        <div className="data-actions">
          <Button variant="primary" onClick={() => {
            downloadText(`printledger-backup-${new Date().toISOString().slice(0, 10)}.json`,
              exportJSON(state), 'application/json');
          }}>
            <IconDownload size={15} /> Export backup (JSON)
          </Button>
          <Button variant="secondary" onClick={() => {
            downloadText(`printledger-products-${new Date().toISOString().slice(0, 10)}.csv`,
              exportProductsCSV(state.products), 'text/csv');
          }}>
            <IconDownload size={15} /> Export products (CSV)
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <IconUpload size={15} /> Import backup…
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const res = importJSON(await file.text());
              if (res.ok && res.data) {
                setImportResult(`Merged into the current dataset (${res.data.products.length} products in backup).`);
                // Merge: keep current products, but take settings/presets from backup.
                dispatch({
                  type: 'data/load',
                  state: {
                    ...res.data,
                    settings: { ...res.data.settings, currency: state.settings.currency, theme: state.settings.theme },
                    products: res.data.products,
                  },
                });
              } else {
                setImportResult(`Import failed: ${res.error ?? 'unknown error'}`);
              }
            }}
          />
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            <IconRefresh size={15} /> Reset to defaults
          </Button>
        </div>
        {importResult && <div className={`import-status ${importResult.startsWith('Import') ? 'err' : ''}`}>{importResult}</div>}
        <Hint>
          Backups are a single JSON file containing settings, libraries, products and history. Import on the
          other device to move your data desktop ↔ mobile.
        </Hint>
      </section>

      <section className="card">
        <h2>Default rates</h2>
        <div className="field-grid two">
          <div className="field">
            <span className="field-label">Default electricity rate (per kWh)</span>
            <div className="field-input-wrap">
              <input
                type="text"
                inputMode="decimal"
                className="field-input"
                value={String(state.settings.kwhRate)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  dispatch({ type: 'settings/update', patch: { kwhRate: isFinite(n) && n >= 0 ? n : 0 } });
                }}
              />
              <span className="field-suffix">/kWh</span>
            </div>
          </div>
          <div className="field">
            <span className="field-label">Default labor rate (per hour)</span>
            <div className="field-input-wrap">
              <input
                type="text"
                inputMode="decimal"
                className="field-input"
                value={String(state.settings.laborRatePerHour)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  dispatch({ type: 'settings/update', patch: { laborRatePerHour: isFinite(n) && n >= 0 ? n : 0 } });
                }}
              />
              <span className="field-suffix">/h</span>
            </div>
          </div>
        </div>
      </section>

      {state.products.length === 0 && (
        <EmptyState
          icon={<IconSparkles size={36} />}
          title="Start with the calculator"
          text="Enter a print, flip on production/packaging modules as needed, and save the result here."
        />
      )}

      {confirmReset && (
        <Modal
          title="Reset all data?"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  dispatch({ type: 'data/reset' });
                  setConfirmReset(false);
                }}
              >
                Reset
              </Button>
            </>
          }
        >
          <Warning>This clears all products, libraries and settings on this device. Export a backup first if you might want your data back.</Warning>
        </Modal>
      )}
    </div>
  );
}