// PrintLedger cost engine.
//
// Every calculation is itemized and transparent: each line below corresponds to
// exactly one row in the summary ("Filament", "Electricity", "Failure Buffer",
// etc.). Nothing is hidden inside a magic number. The engine is pure — given the
// same `CostInput` it always returns the same `CostBreakdown` — which is what
// makes history snapshots and "Recalculate with Current Rates" reliable.

import type {
  CostBreakdown,
  CostInput,
  FilamentLine,
  Presets,
} from './types';

/** Generates a stable id for local records (works everywhere, no UI context). */
export function uid(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rand}`;
}

// ---------------------------------------------------------------------------
// Filament
// ---------------------------------------------------------------------------

/**
 * Cross-sectional area-based meter→gram conversion.
 * grams = meters × π × (diameter/2)² × density, with diameter in mm → cm
 * and metres of length. Defaults approximate a 1.75 mm PLA spool (~2.98 g/m).
 */
export function metersToGrams(
  meters: number,
  diameterMm = 1.75,
  densityGperCm3 = 1.24,
): number {
  const radiusCm = diameterMm / 20; // mm → cm radius (diameter/2)
  const crossSectionCm2 = Math.PI * radiusCm * radiusCm;
  return meters * 100 * crossSectionCm2 * densityGperCm3;
}

/** Per-filament-line cost: grams × (spool price / spool weight). */
export function filamentLineCost(line: FilamentLine): number {
  if (!(line.spoolWeight > 0)) return 0;
  return line.usedGrams * (line.spoolPrice / line.spoolWeight);
}

export function filamentTotal(filament: FilamentLine[]): number {
  return filament.reduce((sum, line) => sum + filamentLineCost(line), 0);
}

// ---------------------------------------------------------------------------
// Machine wear
// ---------------------------------------------------------------------------

/**
 * Hourly machine rate. In `depreciation` mode it spreads the purchase price
 * plus total maintenance spend over the printer's lifespan hours. Returns
 * `{ rate, source: 'direct' | 'depreciation' | 'n/a' }` so UIs can tell the user
 * why the number is zero (no purchase entered yet, for example).
 */
export function machineHourlyRate(input: CostInput['machine']): {
  rate: number;
  source: 'direct' | 'depreciation' | 'not-set';
  lifespanHours: number;
} {
  if (input.mode === 'direct') return { rate: input.directRate, source: 'direct', lifespanHours: 0 };
  const denom = input.lifespanHours;
  if (!(denom > 0)) return { rate: 0, source: 'not-set', lifespanHours: 0 };
  return {
    rate: (input.purchasePrice + input.maintenanceTotal) / denom,
    source: 'depreciation',
    lifespanHours: denom,
  };
}

// ---------------------------------------------------------------------------
// Full breakdown
// ---------------------------------------------------------------------------

/**
 * Compute the full, itemized cost breakdown for a `CostInput`.
 *
 * Math (per unit, all prices in the input's currency):
 *   filament = Σ usedGrams × spoolPrice/spoolWeight
 *   electricity = (hours + minutes/60) × watts/1000 × kwhRate
 *   machine = printHours × hourlyMachineRate
 *   failure = (filament + electricity + machine) × failurePct/100   ← buffer on
 *               the print/machine costs only (labor/hardware are per good unit
 *               and are not wasted when a print fails)
 *   labor = (setupMin + postMin)/60 × laborRate
 *   hardware = Σ qty × unitCost
 *   productionCost = machine sub-total + failure + labor + hardware
 *   packaging = items + packing labor + shipping (0 when disabled)
 *   unitTotal = productionCost + packaging
 *   batchTotal = unitTotal × quantity
 *   price = unitTotal / (1 − feePct/100 − marginPct/100)   ← when pricing enabled
 */
export function computeBreakdown(input: CostInput): CostBreakdown {
  const filament = filamentTotal(input.filament);

  const printHours = input.printTimeHours + input.printTimeMinutes / 60;
  const electricity = printHours * (input.powerWatts / 1000) * input.kwhRate;

  const { rate: machineHourly } = machineHourlyRate(input.machine);
  const machine = printHours * machineHourly;

  const printMachineSubtotal = filament + electricity + machine;
  const failure = printMachineSubtotal * (Math.max(0, input.failurePct) / 100);

  const laborHours = (input.labor.setupMinutes + input.labor.postMinutes) / 60;
  const labor = laborHours * input.labor.ratePerHour;

  const hardware = input.hardware.reduce(
    (sum, line) => sum + line.qty * line.unitCost,
    0,
  );

  const productionCost = printMachineSubtotal + failure + labor + hardware;

  // Packaging — independent module, contributes nothing when disabled.
  const pack = input.packaging;
  const packagingItems = pack.enabled
    ? pack.items.reduce((sum, line) => sum + line.qty * line.unitCost, 0)
    : 0;
  const packagingLabor = pack.enabled
    ? (pack.packingMinutes / 60) * pack.packingRatePerHour
    : 0;
  const packagingShipping = pack.enabled ? pack.shippingPerUnit : 0;
  const packagingCost = packagingItems + packagingLabor + packagingShipping;

  const unitTotal = productionCost + packagingCost;
  const quantity = Math.max(0, input.quantity);
  const batchTotal = unitTotal * quantity;

  // Pricing preview. Price solves for a selling price at which the margin is
  // `marginPct`% of the *selling price*, after the marketplace fee (`feePct`% of
  // the selling price): price × (1 − fee − margin) = unitTotal.
  let price: number | null = null;
  let grossPerUnit: number | null = null;
  let netProfitPerUnit: number | null = null;
  let netProfitBatch: number | null = null;
  let landedMarginPct: number | null = null;

  const marginFeeShare = input.pricing.marginPct + input.pricing.feePct;
  if (input.pricing.enabled && marginFeeShare < 100) {
    price = unitTotal / (1 - marginFeeShare / 100);
    grossPerUnit = price * (1 - input.pricing.feePct / 100);
    netProfitPerUnit = grossPerUnit - unitTotal;
    netProfitBatch = netProfitPerUnit * quantity;
    if (grossPerUnit > 0) {
      landedMarginPct = ((grossPerUnit - unitTotal) / grossPerUnit) * 100;
    }
  } else if (input.pricing.enabled) {
    // margin + fee ≥ 100% is impossible — keep the nulls and let the UI show the guard.
    price = null;
  }

  return {
    filament,
    electricity,
    machine,
    printMachineSubtotal,
    failure,
    labor,
    hardware,
    productionCost,
    packagingItems,
    packagingLabor,
    packagingShipping,
    packagingCost,
    unitTotal,
    batchTotal,
    price,
    grossPerUnit,
    netProfitPerUnit,
    netProfitBatch,
    landedMarginPct,
  };
}

// ---------------------------------------------------------------------------
// Preset resolution & "Recalculate with Current Rates"
// ---------------------------------------------------------------------------
//
// A saved snapshot pins the numeric values it was computed with (so history never
// mutates). But each value may also carry the id of the preset it came from.
// `resolveWithCurrent` re-reads those ids against the *current* libraries and
// settings, computes a fresh breakdown, and reports per-line deltas.

const findSpool = (p: Presets, id?: string) =>
  p.filaments.find((f) => f.id === id);
const findPack = (p: Presets, id?: string) =>
  p.packaging.find((i) => i.id === id);

/**
 * Re-run a saved product against the current libraries + electricity rate.
 * Custom lines and manually-typed values are left exactly as saved.
 */
export function resolveDraftInput(
  input: CostInput,
  presets: Presets,
  kwhRate: number,
): CostInput {
  const resolved: CostInput = {
    ...input,
    kwhRate,
    filament: input.filament.map((line) => {
      if (line.source !== 'preset') return line;
      const spool = findSpool(presets, line.spoolId);
      if (!spool) return line; // preset was deleted — keep the saved numbers
      return { ...line, spoolPrice: spool.price, spoolWeight: spool.spoolWeight };
    }),
    machine: (() => {
      const m = input.machine;
      const printer = presets.printers.find((p) => p.id === m.printerId);
      if (!printer) return m;
      return {
        ...m,
        mode: printer.wearMode,
        directRate: printer.directRate,
        purchasePrice: printer.purchasePrice,
        maintenanceTotal: printer.maintenanceTotal,
        lifespanHours: printer.lifespanHours,
      };
    })(),
    labor: (() => {
      const l = input.labor;
      const rate = presets.laborRates.find((r) => r.id === l.ratePresetId);
      return rate ? { ...l, ratePerHour: rate.ratePerHour } : l;
    })(),
    packaging: {
      ...input.packaging,
      items: input.packaging.items.map((item) => {
        const pack = findPack(presets, item.itemId);
        return pack ? { ...item, unitCost: pack.unitCost } : item;
      }),
    },
  };
  return resolved;
}

/** Compute the delta summary used by "Recalculate with Current Rates". */
export function computeRecalcDeltas(
  oldInput: CostInput,
  kwhRate: number,
  presets: Presets,
): { label: string; old: number; new: number }[] {
  const deltas: { label: string; old: number; new: number }[] = [];

  const diff = (label: string, a: number, b: number) => {
    if (Math.abs(a - b) > 1e-9) deltas.push({ label, old: a, new: b });
  };

  // Use resolution so we can see which *sources* moved, then filter to changes.
  const resolved = resolveDraftInput(oldInput, presets, kwhRate);

  oldInput.filament.forEach((line, i) => {
    if (line.source !== 'preset') return;
    const spool = findSpool(presets, line.spoolId);
    if (!spool) return;
    const oldCost = filamentLineCost(line);
    const newLine = resolved.filament[i];
    const newCost = newLine ? filamentLineCost(newLine) : oldCost;
    diff(`${line.name} spool`, oldCost, newCost);
  });

  const printer = presets.printers.find((p) => p.id === oldInput.machine.printerId);
  if (printer) {
    const oldRate = machineHourlyRate(oldInput.machine).rate;
    const newRate = machineHourlyRate(resolved.machine).rate;
    diff('Machine rate', oldRate, newRate);
  }

  if (oldInput.labor.ratePresetId) {
    diff('Labor rate', oldInput.labor.ratePerHour, resolved.labor.ratePerHour);
  }

  oldInput.packaging.items.forEach((item, i) => {
    if (!item.itemId) return;
    const pack = findPack(presets, item.itemId);
    if (!pack) return;
    const oldItem = item.unitCost;
    const newItem = resolved.packaging.items[i]?.unitCost ?? oldItem;
    diff(`${item.name} packaging`, oldItem, newItem);
  });

  diff('Electricity rate (per kWh)', oldInput.kwhRate, kwhRate);
  return deltas;
}

