// PrintLedger core domain types. Everything here is pure data — no UI, no I/O —
// so the cost engine and parsers are fully testable and shareable across the
// web, Electron, and Capacitor builds.

export type CurrencyCode = string; // ISO 4217 code ('INR', 'USD', 'EUR') or 'CUSTOM'

export type ThemeSetting = 'light' | 'dark' | 'system';

// ---------------------------------------------------------------------------
// Cost input — everything the user enters for one calculation.
// ---------------------------------------------------------------------------

export interface FilamentLine {
  id: string;
  /** Display name; defaults to preset name or "Filament" */
  name: string;
  /** 'preset' = resolved from the filament library, 'custom' = typed manually */
  source: 'preset' | 'custom';
  /** Filament library preset id when `source === 'preset'` */
  spoolId?: string;
  /** grams of filament consumed per unit (the value used in costing) */
  usedGrams: number;
  /** How the user entered the amount — grams directly, or meters of filament */
  inputMode: 'grams' | 'meters';
  /** meters entered when `inputMode === 'meters'` (converted using diameter+density) */
  usedMeters?: number;
  /** spool price, resolved from the preset or entered manually */
  spoolPrice: number;
  /** spool weight in grams, resolved from the preset or entered manually (default 1000) */
  spoolWeight: number;
  /** filament diameter in mm, used for meter→gram conversion (default 1.75) */
  diameter?: number;
  /** material density in g/cm³, used for meter→gram conversion (default 1.24 ≈ PLA) */
  density?: number;
}

export interface MachineInput {
  /** 'direct' = a flat hourly rate; 'depreciation' = derived from purchase+maintenance/lifespan */
  mode: 'direct' | 'depreciation';
  /** Printer library preset id when the machine came from the library */
  printerId?: string;
  /** hourly machine rate for `direct` mode */
  directRate: number;
  purchasePrice: number;
  maintenanceTotal: number;
  lifespanHours: number;
}

export interface HardwareLine {
  id: string;
  name: string;
  qty: number;
  unitCost: number;
}

export interface LaborInput {
  setupMinutes: number;
  postMinutes: number;
  /** hourly rate, resolved from a labor-rate preset or entered manually */
  ratePerHour: number;
  /** Labor library preset id when applicable */
  ratePresetId?: string;
}

export interface PackLine {
  id: string;
  name: string;
  qty: number;
  unitCost: number;
  /** Packaging library id when the item was picked from the library */
  itemId?: string;
}

export interface PackagingInput {
  /** Master on/off for this calculation — independent per product */
  enabled: boolean;
  items: PackLine[];
  packingMinutes: number;
  packingRatePerHour: number;
  shippingPerUnit: number;
}

export interface PricingInput {
  enabled: boolean;
  /** target profit margin, as a % of the selling price */
  marginPct: number;
  /** marketplace + payment fee, as a % of the selling price */
  feePct: number;
}

export interface CostInput {
  currency: CurrencyCode;
  /** batch size — "Batch Total" = unit total × quantity */
  quantity: number;

  filament: FilamentLine[];
  printTimeHours: number;
  printTimeMinutes: number;
  /** average measured printer power draw in Watts */
  powerWatts: number;
  /** electricity cost per kWh */
  kwhRate: number;

  /** failure-rate buffer (%) applied to the print/machine costs */
  failurePct: number;
  machine: MachineInput;
  labor: LaborInput;
  hardware: HardwareLine[];

  packaging: PackagingInput;
  pricing: PricingInput;
}

// ---------------------------------------------------------------------------
// Cost breakdown — fully itemized computed output.
// ---------------------------------------------------------------------------

export interface CostBreakdown {
  // --- Base (per unit) ---
  /** Σ usedGrams × (spoolPrice / spoolWeight) */
  filament: number;
  /** (h + min/60) × watts/1000 × kWh rate */
  electricity: number;
  /** print hours × hourly machine rate (direct or depreciation-derived) */
  machine: number;
  /** filament + electricity + machine — the print/machine cost the failure buffer applies to */
  printMachineSubtotal: number;
  /** printMachineSubtotal × failurePct/100 */
  failure: number;
  /** (setup + post) minutes/60 × labor rate */
  labor: number;
  /** Σ qty × unitCost for extra hardware */
  hardware: number;

  /** per-unit production cost = subtotal + failure + labor + hardware */
  productionCost: number;

  // --- Packaging (per unit, zero when disabled) ---
  packagingItems: number;
  packagingLabor: number;
  packagingShipping: number;
  packagingCost: number;

  /** per-unit grand total */
  unitTotal: number;
  /** unitTotal × quantity (0 when quantity is 0) */
  batchTotal: number;

  // --- Pricing preview (null when disabled) ---
  price: number | null;
  grossPerUnit: number | null;
  netProfitPerUnit: number | null;
  netProfitBatch: number | null;
  /** gross margin actually earned given the fees — (gross − unitTotal) / gross */
  landedMarginPct: number | null;
}

// A snapshot is the frozen record of one calculation: inputs + computed output.
export interface CostSnapshot {
  input: CostInput;
  breakdown: CostBreakdown;
  computedAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Products & revisions
// ---------------------------------------------------------------------------

export interface ProductRevision {
  id: string;
  at: string;
  note: string;
  snapshot: CostSnapshot;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** current cost snapshot (recomputable against current rates, see core/recalculate.ts) */
  snapshot: CostSnapshot;
  /** prior versions, newest first; `snapshot` is the current version */
  history: ProductRevision[];
}

// ---------------------------------------------------------------------------
// Libraries / presets
// ---------------------------------------------------------------------------

export interface FilamentPreset {
  id: string;
  name: string;
  material?: string;
  color?: string;
  diameter: number; // mm
  density: number; // g/cm³
  price: number; // per spool, in the current currency
  spoolWeight: number; // grams
  /** remaining grams when tracked; null when untracked */
  remainingGrams: number | null;
  /** when true, saving a product/batch that uses this spool decrements remainingGrams */
  trackRemaining: boolean;
  /** when true and trackRemaining, decrement happens automatically on save */
  deductOnLog: boolean;
}

export interface PrinterPreset {
  id: string;
  name: string;
  watts: number;
  wearMode: 'direct' | 'depreciation';
  directRate: number;
  purchasePrice: number;
  maintenanceTotal: number;
  lifespanHours: number;
}

export interface LaborPreset {
  id: string;
  name: string;
  ratePerHour: number;
}

export interface PackPreset {
  id: string;
  name: string;
  unitCost: number;
  note?: string;
}

export interface Presets {
  filaments: FilamentPreset[];
  printers: PrinterPreset[];
  laborRates: LaborPreset[];
  packaging: PackPreset[];
}

// ---------------------------------------------------------------------------
// Settings & app state
// ---------------------------------------------------------------------------

export interface Settings {
  currency: CurrencyCode;
  theme: ThemeSetting;
  /** default electricity rate pre-filled into new calculations */
  kwhRate: number;
  /** default labor rate pre-filled into new calculations */
  laborRatePerHour: number;
}

export interface AppState {
  version: 1;
  settings: Settings;
  presets: Presets;
  products: Product[];
  /** the live calculator draft — persisted so work is never lost */
  draft: CostInput;
  /** sequence number bumped every time a filament spool is deducted on save */
  spoolDeductionLogId: number;
}

/** A key-level store of deduction events (also kept in the products screen tooling). */
export interface SpoolDeduction {
  id: string;
  at: string;
  spoolId: string;
  spoolName: string;
  grams: number;
  remainingAfter: number;
  productName: string;
  unitGrams: number;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

export type CapStringified<T> = { $type: T };

export interface ImportedData {
  settings?: Settings;
  presets?: Presets;
  products?: Product[];
  draft?: CostInput;
}

export type ImportMode = 'merge' | 'replace';