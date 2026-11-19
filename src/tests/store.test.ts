import { describe, it, expect } from 'vitest';
import { reducer, updateIn, getIn, planDeductions } from '../state/store';
import { makeEmptyState } from '../core/presets';
import type { AppState, CostInput, FilamentPreset } from '../core/types';

function sampleDraft(): CostInput {
  return {
    currency: 'USD',
    quantity: 5,
    filament: [{ id: 'l1', name: 'PLA', source: 'preset', spoolId: 'fil-pla-1kg', usedGrams: 20, spoolPrice: 1200, spoolWeight: 1000, inputMode: 'grams' }],
    printTimeHours: 1,
    printTimeMinutes: 0,
    powerWatts: 180,
    kwhRate: 0.16,
    failurePct: 10,
    machine: { mode: 'direct', printerId: undefined, directRate: 3, purchasePrice: 0, maintenanceTotal: 0, lifespanHours: 0 },
    labor: { setupMinutes: 5, postMinutes: 5, ratePerHour: 600, ratePresetId: 'labor-standard' },
    hardware: [],
    packaging: { enabled: false, items: [], packingMinutes: 0, packingRatePerHour: 0, shippingPerUnit: 0 },
    pricing: { enabled: false, marginPct: 30, feePct: 10 },
  };
}

describe('updateIn / getIn', () => {
  it('updates nested paths immutably', () => {
    const d = sampleDraft();
    const next = updateIn(d, ['filament', 0, 'usedGrams'], 55) as CostInput;
    expect(next.filament[0].usedGrams).toBe(55);
    expect(d.filament[0].usedGrams).toBe(20); // original untouched
    expect(getIn(next, ['filament', 0, 'spoolWeight'])).toBe(1000);
  });

  it('appends array elements via path', () => {
    const d = sampleDraft();
    const next = updateIn(d, ['hardware'], [...d.hardware, { id: 'h1', name: 'Magnet', qty: 2, unitCost: 1 }]) as CostInput;
    expect(next.hardware).toHaveLength(1);
  });
});

describe('reducer', () => {
  it('patches draft at a path', () => {
    let s: AppState = makeEmptyState();
    s = reducer(s, { type: 'draft/patch', path: ['printTimeHours'], value: 8 });
    expect(s.draft.printTimeHours).toBe(8);
  });

  it('settings update merges', () => {
    let s: AppState = makeEmptyState();
    s = reducer(s, { type: 'settings/update', patch: { currency: 'INR' } });
    expect(s.settings.currency).toBe('INR');
  });

  it('saves a new product, then overwrites it keeping history', () => {
    let s = makeEmptyState();
    const draft = sampleDraft();
    s = reducer(s, {
      type: 'product/save',
      id: undefined,
      draft,
      meta: { name: 'Widget', sku: 'W1', category: 'C', tags: ['x'], notes: '' },
      mode: 'new',
    });
    expect(s.products).toHaveLength(1);
    const id = s.products[0].id;
    expect(s.products[0].snapshot.breakdown.unitTotal).toBeGreaterThan(0);

    // overwrite — same id, no history entry
    const draft2 = { ...draft, printTimeHours: 9 };
    s = reducer(s, { type: 'product/save', id, draft: draft2, meta: { name: 'Widget', sku: 'W1', category: 'C', tags: ['x'], notes: '' }, mode: 'overwrite' });
    expect(s.products).toHaveLength(1);
    expect(s.products[0].history).toHaveLength(0);
    expect(s.products[0].snapshot.input.printTimeHours).toBe(9);

    // version — pushes current snapshot into history
    const draft3 = { ...draft2, printTimeHours: 10 };
    s = reducer(s, { type: 'product/save', id, draft: draft3, meta: { name: 'Widget', sku: 'W1', category: 'C', tags: ['x'], notes: '' }, mode: 'version', note: 'v3' });
    expect(s.products[0].history).toHaveLength(1);
    expect(s.products[0].history[0].snapshot.input.printTimeHours).toBe(9);
    expect(s.products[0].snapshot.input.printTimeHours).toBe(10);
  });

  it('duplicates a product', () => {
    let s = makeEmptyState();
    s = reducer(s, { type: 'product/save', id: undefined, draft: sampleDraft(), meta: { name: 'Widget', sku: 'W1', category: '', tags: [], notes: '' }, mode: 'new' });
    const id = s.products[0].id;
    s = reducer(s, { type: 'product/duplicate', id });
    expect(s.products).toHaveLength(2);
    expect(s.products[0].name).toContain('copy');
    expect(s.products[0].id).not.toBe(id);
  });

  it('preset/deduct decrements tracked spool remaining grams', () => {
    let s = makeEmptyState();
    const spool = s.presets.filaments.find((f) => f.id === 'fil-pla-1kg') as FilamentPreset;
    expect(spool.remainingGrams).toBe(1000);
    s = reducer(s, { type: 'preset/deduct', deductions: [{ spoolId: 'fil-pla-1kg', grams: 100 }] });
    const afterSpool = s.presets.filaments.find((f) => f.id === 'fil-pla-1kg') as FilamentPreset;
    expect(afterSpool.remainingGrams).toBe(900);
  });

  it('planDeductions computes per-spool grams for a batch', () => {
    const s = makeEmptyState();
    const plan = planDeductions(s.presets, sampleDraft(), 5);
    expect(plan).toHaveLength(1);
    expect(plan[0].grams).toBe(100);
    expect(plan[0].remainingAfter).toBe(900);
  });

  it('clamps spool remaining at 0 (never negative)', () => {
    let s = makeEmptyState();
    s = reducer(s, { type: 'preset/deduct', deductions: [{ spoolId: 'fil-pla-1kg', grams: 1500 }] });
    const spool = s.presets.filaments.find((f) => f.id === 'fil-pla-1kg') as FilamentPreset;
    expect(spool.remainingGrams).toBe(0);
  });

  it('deduction only touches tracked filaments', () => {
    let s = makeEmptyState();
    // Turn off tracking on the seeded spool.
    s = reducer(s, { type: 'preset/update', collection: 'filaments', id: 'fil-pla-1kg', patch: { trackRemaining: false, remainingGrams: null } });
    s = reducer(s, { type: 'preset/deduct', deductions: [{ spoolId: 'fil-pla-1kg', grams: 100 }] });
    const spool = s.presets.filaments.find((f) => f.id === 'fil-pla-1kg') as FilamentPreset;
    expect(spool.remainingGrams).toBeNull();
  });
});