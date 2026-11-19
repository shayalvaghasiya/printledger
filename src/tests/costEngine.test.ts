import { describe, it, expect } from 'vitest';
import {
  metersToGrams,
  filamentLineCost,
  filamentTotal,
  machineHourlyRate,
  computeBreakdown,
  resolveDraftInput,
  computeRecalcDeltas,
} from '../core/costEngine';
import type { CostInput, Presets } from '../core/types';

const presets: Presets = {
  filaments: [
    { id: 'pla', name: 'PLA', material: 'PLA', color: '#e8803c', diameter: 1.75, density: 1.24, price: 1200, spoolWeight: 1000, remainingGrams: 1000, trackRemaining: true, deductOnLog: true },
  ],
  printers: [
    { id: 'pr1', name: 'Printer', watts: 180, wearMode: 'depreciation', directRate: 3, purchasePrice: 16000, maintenanceTotal: 3000, lifespanHours: 8000 },
  ],
  laborRates: [{ id: 'lab', name: 'Labor', ratePerHour: 600 }],
  packaging: [
    { id: 'box', name: 'Mailer box', unitCost: 18 },
  ],
};

export function makeInput(): CostInput {
  return {
    currency: 'INR',
    quantity: 10,
    filament: [
      {
        id: 'f1', name: 'PLA', source: 'preset', spoolId: 'pla',
        usedGrams: 25, spoolPrice: 1200, spoolWeight: 1000,
        inputMode: 'grams', diameter: 1.75, density: 1.24,
      },
    ],
    printTimeHours: 3,
    printTimeMinutes: 30, // 3.5 h
    powerWatts: 200,
    kwhRate: 6,
    failurePct: 10,
    machine: {
      mode: 'depreciation', printerId: 'pr1',
      directRate: 3, purchasePrice: 16000, maintenanceTotal: 3000, lifespanHours: 8000,
    },
    labor: { setupMinutes: 10, postMinutes: 20, ratePerHour: 600, ratePresetId: 'lab' },
    hardware: [
      { id: 'h1', name: 'Magnets', qty: 4, unitCost: 2.5 },
      { id: 'h2', name: 'Screws', qty: 2, unitCost: 1 },
    ],
    packaging: {
      enabled: true,
      items: [{ id: 'p1', name: 'Mailer box', qty: 1, unitCost: 18, itemId: 'box' }],
      packingMinutes: 2,
      packingRatePerHour: 600,
      shippingPerUnit: 40,
    },
    pricing: { enabled: true, marginPct: 30, feePct: 10 },
  };
}

describe('metersToGrams', () => {
  it('converts 1 m of 1.75 mm PLA (~2.98 g/m)', () => {
    expect(metersToGrams(1)).toBeCloseTo(2.9826, 3);
  });
  it('scales linearly with length', () => {
    expect(metersToGrams(10, 1.75, 1.24)).toBeCloseTo(metersToGrams(1) * 10, 6);
  });
});

describe('filament math', () => {
  it('per-line cost = grams × price/weight', () => {
    expect(filamentLineCost({ id: 'x', name: '', source: 'custom', usedGrams: 25, spoolPrice: 1200, spoolWeight: 1000, inputMode: 'grams' })).toBeCloseTo(30, 9);
  });
  it('sums multiple lines', () => {
    const l1 = { id: 'a', name: '', source: 'custom' as const, usedGrams: 10, spoolPrice: 100, spoolWeight: 1000, inputMode: 'grams' as const };
    const l2 = { id: 'b', name: '', source: 'custom' as const, usedGrams: 20, spoolPrice: 500, spoolWeight: 1000, inputMode: 'grams' as const };
    expect(filamentTotal([l1, l2])).toBeCloseTo(11, 9);
  });
});

describe('machineHourlyRate', () => {
  it('direct mode returns the flat rate', () => {
    expect(machineHourlyRate({ mode: 'direct', printerId: undefined, directRate: 7, purchasePrice: 0, maintenanceTotal: 0, lifespanHours: 0 }).rate).toBe(7);
  });
  it('depreciation spreads purchase + maintenance over lifespan', () => {
    expect(machineHourlyRate({ mode: 'depreciation', printerId: undefined, directRate: 0, purchasePrice: 16000, maintenanceTotal: 3000, lifespanHours: 8000 }).rate).toBeCloseTo(2.375, 9);
  });
  it('guards against zero lifespan', () => {
    const r = machineHourlyRate({ mode: 'depreciation', printerId: undefined, directRate: 0, purchasePrice: 16000, maintenanceTotal: 3000, lifespanHours: 0 });
    expect(r.rate).toBe(0);
    expect(r.source).toBe('not-set');
  });
});

describe('computeBreakdown — full hand-computed fixture', () => {
  const b = computeBreakdown(makeInput());

  it('filament', () => {
    expect(b.filament).toBeCloseTo(30, 6); // 25g × 1.2
  });
  it('electricity', () => {
    // 3.5 h × 0.2 kW × ₹6 = ₹4.2
    expect(b.electricity).toBeCloseTo(4.2, 6);
  });
  it('machine depreciation rate = (16000+3000)/8000 = 2.375/h; 3.5h → 8.3125', () => {
    expect(b.machine).toBeCloseTo(8.3125, 6);
  });
  it('print/machine subtotal', () => {
    expect(b.printMachineSubtotal).toBeCloseTo(30 + 4.2 + 8.3125, 6);
  });
  it('failure buffer = 10% of print/machine', () => {
    expect(b.failure).toBeCloseTo((30 + 4.2 + 8.3125) * 0.1, 6);
  });
  it('labor = (10+20)/60 × 600 = 300', () => {
    expect(b.labor).toBeCloseTo(300, 6);
  });
  it('hardware = 4×2.5 + 2×1 = 12', () => {
    expect(b.hardware).toBeCloseTo(12, 6);
  });
  it('production cost / unit', () => {
    const sub = 30 + 4.2 + 8.3125;
    expect(b.productionCost).toBeCloseTo(sub + sub * 0.1 + 300 + 12, 6);
  });
  it('packaging items + labor + shipping', () => {
    expect(b.packagingItems).toBeCloseTo(18, 6);
    expect(b.packagingLabor).toBeCloseTo((2 / 60) * 600, 6); // 20
    expect(b.packagingShipping).toBe(40);
    expect(b.packagingCost).toBeCloseTo(18 + 20 + 40, 6);
  });
  it('unit total = production + packaging', () => {
    const sub = 30 + 4.2 + 8.3125;
    const production = sub + sub * 0.1 + 300 + 12;
    expect(b.unitTotal).toBeCloseTo(production + 78, 6);
  });
  it('batch total = unit × quantity', () => {
    expect(b.batchTotal).toBeCloseTo(b.unitTotal * 10, 6);
  });
  it('pricing: price = unit / (1 − 0.30 − 0.10)', () => {
    const sub = 30 + 4.2 + 8.3125;
    const production = sub + sub * 0.1 + 300 + 12;
    const unit = production + 78;
    expect(b.price).toBeCloseTo(unit / 0.6, 6);
    expect(b.grossPerUnit).toBeCloseTo((unit / 0.6) * 0.9, 6);
    expect(b.netProfitPerUnit).toBeCloseTo((unit / 0.6) * 0.9 - unit, 6);
    expect(b.netProfitBatch).toBeCloseTo(((unit / 0.6) * 0.9 - unit) * 10, 6);
  });
});

describe('computeBreakdown — edge cases', () => {
  it('pricing guard: margin+fee ≥ 100 → price null', () => {
    const i = makeInput();
    i.pricing = { enabled: true, marginPct: 60, feePct: 40 };
    const b = computeBreakdown(i);
    expect(b.price).toBeNull();
    expect(b.netProfitPerUnit).toBeNull();
  });
  it('packaging disabled contributes zero', () => {
    const i = makeInput();
    i.packaging.enabled = false;
    const b = computeBreakdown(i);
    expect(b.packagingCost).toBe(0);
    expect(b.unitTotal).toBeCloseTo(b.productionCost, 9);
  });
  it('pricing disabled leaves price null', () => {
    const i = makeInput();
    i.pricing.enabled = false;
    const b = computeBreakdown(i);
    expect(b.price).toBeNull();
    expect(b.netProfitPerUnit).toBeNull();
  });
  it('quantity 0 → batch total 0', () => {
    const i = makeInput();
    i.quantity = 0;
    expect(computeBreakdown(i).batchTotal).toBe(0);
  });
});

describe('recalculate with current rates', () => {
  it('resolves preset-linked values against the current libraries', () => {
    const i = makeInput();
    const newPresets: Presets = {
      ...presets,
      filaments: [{ ...presets.filaments[0], price: 1500, spoolWeight: 1000 }], // price went up ₹300
    };
    const resolved = resolveDraftInput(i, newPresets, 7);
    expect(resolved.filament[0].spoolPrice).toBe(1500);
    expect(resolved.kwhRate).toBe(7); // global setting
    // Custom/manual values unchanged:
    expect(resolved.labor.setupMinutes).toBe(10);
    expect(resolved.hardware).toHaveLength(2);
  });

  it('reports deltas only for changed sources', () => {
    const i = makeInput();
    const newPresets: Presets = {
      ...presets,
      filaments: [{ ...presets.filaments[0], price: 1500 }],
      packaging: [{ ...presets.packaging[0], unitCost: 20 }],
    };
    const deltas = computeRecalcDeltas(i, 6.5, newPresets);
    const labels = deltas.map((d) => d.label);
    expect(labels).toContain('PLA spool');
    expect(deltas.find((d) => d.label === 'PLA spool')!.old).toBeCloseTo(30, 6);
    expect(deltas.find((d) => d.label === 'PLA spool')!.new).toBeCloseTo(37.5, 6);
    expect(labels).toContain('Mailer box packaging');
    expect(labels).toContain('Electricity rate (per kWh)');
  });

  it('custom (non-preset) lines never change on recalc', () => {
    const i = makeInput();
    i.filament[0].source = 'custom';
    i.filament[0].spoolId = undefined;
    const resolved = resolveDraftInput(i, presets, 99);
    expect(resolved.filament[0].spoolPrice).toBe(i.filament[0].spoolPrice);
  });
});