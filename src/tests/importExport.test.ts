import { describe, it, expect } from 'vitest';
import {
  exportJSON,
  importJSON,
  exportProductsCSV,
  productToCsvRow,
  csvField,
} from '../core/importExport';
import type { AppState, Product, FilamentLine } from '../core/types';

function sampleLine(): FilamentLine {
  return { id: 'l1', name: 'PLA', source: 'preset', spoolId: 'x', usedGrams: 24, spoolPrice: 1200, spoolWeight: 1000, inputMode: 'grams' };
}

function sampleProduct(overrides: Partial<Product> = {}): Product {
  const draft: AppState['draft'] = {
    currency: 'INR',
    quantity: 2,
    filament: [sampleLine()],
    printTimeHours: 2,
    printTimeMinutes: 30,
    powerWatts: 180,
    kwhRate: 6,
    failurePct: 10,
    machine: { mode: 'direct', printerId: undefined, directRate: 4, purchasePrice: 0, maintenanceTotal: 0, lifespanHours: 0 },
    labor: { setupMinutes: 10, postMinutes: 15, ratePerHour: 600, ratePresetId: 'lab' },
    hardware: [],
    packaging: { enabled: false, items: [], packingMinutes: 0, packingRatePerHour: 0, shippingPerUnit: 0 },
    pricing: { enabled: true, marginPct: 30, feePct: 10 },
  };
  return {
    id: 'p1',
    name: 'Earbud Stand',
    sku: 'EB-1',
    category: 'Home',
    tags: ['desk', 'gift'],
    notes: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    snapshot: {
      input: draft,
      breakdown: {
        filament: 28.8, electricity: 2.7, machine: 10, printMachineSubtotal: 41.5, failure: 4.15,
        labor: 250, hardware: 0, productionCost: 295.65, packagingItems: 0, packagingLabor: 0,
        packagingShipping: 0, packagingCost: 0, unitTotal: 295.65, batchTotal: 591.3,
        price: 492.75, grossPerUnit: 443.475, netProfitPerUnit: 147.825, netProfitBatch: 295.65,
        landedMarginPct: 33.3333,
      },
      computedAt: '2024-01-02T00:00:00.000Z',
    },
    history: [],
    ...overrides,
  };
}

function sampleState(): AppState {
  return {
    version: 1,
    settings: { currency: 'INR', theme: 'system', kwhRate: 6, laborRatePerHour: 600 },
    presets: {
      filaments: [],
      printers: [],
      laborRates: [{ id: 'lab', name: 'Labor', ratePerHour: 600 }],
      packaging: [],
    },
    products: [sampleProduct()],
    draft: sampleProduct().snapshot.input,
    spoolDeductionLogId: 0,
  };
}

describe('JSON export / import', () => {
  it('exports a backup and imports it back', () => {
    const state = sampleState();
    const text = exportJSON(state);
    const res = importJSON(text);
    expect(res.ok).toBe(true);
    expect(res.data).toEqual(state);
  });

  it('accepts a bare AppState (no envelope)', () => {
    const state = sampleState();
    const res = importJSON(JSON.stringify(state));
    expect(res.ok).toBe(true);
    expect(res.data?.products).toHaveLength(1);
  });

  it('rejects invalid JSON', () => {
    const res = importJSON('{not json');
    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('rejects valid JSON that is not a backup', () => {
    const res = importJSON(JSON.stringify({ hello: 'world' }));
    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('preserves nested numeric precision through serialization', () => {
    const state = sampleState();
    const round = importJSON(exportJSON(state));
    expect(round.data?.products[0].snapshot.breakdown.unitTotal).toBeCloseTo(295.65, 9);
  });
});

describe('CSV export', () => {
  it('escapes commas and quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('plain')).toBe('plain');
    expect(csvField(42)).toBe('42');
    expect(csvField(null)).toBe('');
  });

  it('produces a header + one row per product', () => {
    const csv = exportProductsCSV([sampleProduct(), sampleProduct({ id: 'p2', sku: 'EB-2' })]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('name,sku,category');
  });

  it('row includes unit cost and batch totals', () => {
    const row = productToCsvRow(sampleProduct());
    expect(row).toContain('Earbud Stand');
    expect(row).toContain('295.65');
    expect(row).toContain('591.3');
  });

  it('empty product list → header only', () => {
    const csv = exportProductsCSV([]);
    expect(csv.trim().split('\n')).toHaveLength(1);
  });
});