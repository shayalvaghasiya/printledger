# PrintLedger — 3D Print Cost & Production Studio

Offline-first cost calculator for 3D printing makers, studios, and small sellers.
Every cost is itemized and transparent — nothing hidden. Runs in the browser,
as a desktop app (Electron), and on mobile (Capacitor → Android/iOS).

## Features

- **Cost Calculator** — real-time per-unit costing:
  - **Base print cost**: multi-filament lines (grams × spool price ÷ spool
    weight; meters → grams via filament diameter/density), electricity
    (time × wattage × kWh rate).
  - **Production cost**: failure-rate buffer (%), machine wear via
    depreciation (purchase + maintenance ÷ lifespan) or a flat hourly rate,
    labor & post-processing (minutes × rate), extra hardware line items.
  - **Packaging cost**: independent per-calculation module — library items +
    custom lines, packing labor, shipping estimate.
  - **Pricing preview**: target margin % + marketplace fee % → suggested
    selling price and net profit (per unit & per batch).
  - Summary panel: Filament · Electricity · Machine wear · Failure buffer ·
    Labor & hardware · Packaging · **Grand total/unit** · **Batch total**.
- **Saved Products** — save/update with name, SKU, category, tags, notes,
  batch size, full cost snapshot, packaging & pricing state. Search, filter,
  sort, **duplicate as variant**, **overwrite vs. save-as-new-version** with a
  revision history, and **“Recalculate with current rates”** showing
  before/after deltas.
- **Libraries** — filament spools (with remaining-grams tracking and
  “deduct on production log”), printer profiles, labor rates, packaging
  materials. Import **.gcode / .3mf** slices to auto-fill print time +
  filament use (manual entry always available).
- **Fully offline-first** — data lives on the device (IndexedDB with a
  localStorage mirror). JSON backup + CSV export built in.
- **Responsive UI** — thumb-friendly single-column + sticky summary on mobile,
  multi-column workspace with data tables on desktop; light/dark/system theme;
  INR / USD / EUR / GBP / JPY formatting.

## Tech stack

React 18 · TypeScript 5.6 · Vite 5 · Electron 32 (desktop shell) ·
Capacitor 6 (mobile) · Vitest (tests). `base: './'` so the production build
loads from `file://` in Electron without a server.

## Getting started

```bash
npm install
npm test        # unit + render smoke tests
npm run build   # type-check + production build → dist/
```

## Run in the browser (dev)

```bash
npm run dev
```

Opens on `http://localhost:5173` (hosted on the LAN too, see mobile).

To preview the production build:

```bash
npm run preview
```

## Run as a desktop app (Electron)

```bash
# one window with hot reload:
npm run dev:electron

# or build-then-launch:
npm run desktop
```

## Run on mobile

**Fastest: phone browser over LAN**

1. `npm run dev` (Vite serves on `0.0.0.0` by default).
2. On the phone (same Wi-Fi), open `http://<your-computer-LAN-ip>:5173`.

For a production feel:

```bash
npm run build && npm run preview
```

then open `http://<your-computer-LAN-ip>:4173` on the phone. Install-to-home-screen
adds an app-like experience.

**Native app (Capacitor)**

Prerequisites: Android Studio (with SDK) for Android; macOS + Xcode for iOS.

```bash
npm run build

# Android
npm run cap:add:android   # once
npm run cap:sync
# open android/ in Android Studio, then Run

# iOS (macOS only)
npm run cap:add:ios       # once
npm run cap:sync
# open ios/ in Xcode, then Run
```

## Data & offline-first

- All state persists automatically (debounced) as a single JSON tree in
  **IndexedDB**, mirrored to **localStorage** — the app works with no network
  and never loses your draft.
- **Backup**: Settings → *Export JSON* gives a full backup; *Import JSON*
  merges on load. **CSV**: export saved products for spreadsheets/accounting.
- Clearing site data removes everything — export a JSON backup first.

## Currencies & starter presets

- Prices in the bundled starter presets (spools, printers, labor, packaging)
  are **currency-neutral numbers** interpreted in whichever currency you
  select (switch currency in the sidebar/topbar; default USD).
- Starter presets ship: PLA/PETG spools (with remaining-grams tracking),
  an Ender-3-style printer profile (depreciation model), two labor rates,
  and common packaging materials — edit or delete them freely in **Libraries**.

## Project layout

```
src/
  core/      Pure logic — cost engine, parsers (.gcode/.3mf), storage,
             import/export, formatting (no React).
  state/     Reducer store + persistence (Context + useReducer), draft,
             products, presets, settings.
  screens/   Calculator · Products · Libraries (Presets) · Settings.
  ui/        Shared components (fields, sections, modals, summary).
  styles/    Theme (light/dark) + responsive layout.
src/tests/   Unit tests for engine/parser/store/format + app render smoke test.
electron/    Thin desktop shell.
capacitor.config.ts   Mobile config (appId com.printledger.app).
```

## Troubleshooting

- **“No data after update / empty state”**: check you didn’t clear site data;
  restore from a JSON backup if needed.
- **Electron doesn’t open a window on Linux**: install `libnss3`-family
  dependencies, or just use the browser build.
- **IndexedDB blocked** (private mode, some webviews): the localStorage mirror
  keeps the app functional.
