// PrintLedger starter presets — seeded on first launch so a new user has working
// defaults and sees a meaningful summary immediately.
//
// Prices here are currency-neutral numbers interpreted against whatever currency
// is selected in Settings (a preset price of "1200" shows as ₹1,200 or $1,200
// depending on the user's currency). The README explains this trade-off.

import type { AppState, LaborPreset, Presets } from './types';

export const STORAGE_KEY = 'printledger:v1';

const FILAMENT_DEFAULTS = {
  diameter: 1.75,
  density: 1.24, // PLA ≈ 1.24 g/cm³ (physical property; affects meter→gram)
};

export function defaultPresets(): Presets {
  const filaments = [
    {
      id: 'fil-pla-1kg',
      name: 'PLA 1 kg spool',
      material: 'PLA',
      color: '#e8803c',
      ...FILAMENT_DEFAULTS,
      price: 1200,
      spoolWeight: 1000,
      remainingGrams: 1000,
      trackRemaining: true,
      deductOnLog: true,
    },
    {
      id: 'fil-petg-1kg',
      name: 'PETG 1 kg spool',
      material: 'PETG',
      color: '#d6456b',
      ...FILAMENT_DEFAULTS,
      price: 1400,
      spoolWeight: 1000,
      remainingGrams: 1000,
      trackRemaining: true,
      deductOnLog: true,
    },
    {
      id: 'fil-pla-250g',
      name: 'PLA 250 g sample',
      material: 'PLA',
      color: '#5aa9e8',
      ...FILAMENT_DEFAULTS,
      price: 400,
      spoolWeight: 250,
      remainingGrams: 250,
      trackRemaining: true,
      deductOnLog: true,
    },
  ];

  const printers = [
    {
      id: 'printer-fdm-standard',
      name: 'Standard FDM printer (Ender-3 class)',
      watts: 180,
      wearMode: 'depreciation' as const,
      directRate: 4,
      purchasePrice: 16000,
      maintenanceTotal: 3000,
      lifespanHours: 8000,
    },
  ];

  const laborRates: LaborPreset[] = [
    { id: 'labor-standard', name: 'Standard maker labor', ratePerHour: 600 },
    { id: 'labor-studio', name: 'Studio/shop labor', ratePerHour: 1200 },
  ];

  const packaging = [
    { id: 'pack-mailer-box', name: 'Rigid mailer box', unitCost: 18, note: '120 × 90 × 30 mm' },
    { id: 'pack-bubble-wrap', name: 'Bubble wrap sheet', unitCost: 8, note: 'per unit' },
    { id: 'pack-sticker-card', name: 'Branded sticker / thank-you card', unitCost: 6 },
    { id: 'pack-shipping-label', name: 'Shipping label', unitCost: 4, note: 'per unit' },
  ];

  return { filaments, printers, laborRates, packaging };
}

export function defaultSettings() {
  return {
    currency: 'USD',
    theme: 'system' as const,
    kwhRate: 0.16,
    laborRatePerHour: 600,
  };
}

export function createEmptyDraft(settings: AppState['settings']): AppState['draft'] {
  const f = defaultPresets();
  const spool = f.filaments[0];
  const printer = f.printers[0];
  return {
    currency: settings.currency,
    quantity: 1,
    filament: [
      {
        id: 'line-1',
        name: spool.name,
        source: 'preset',
        spoolId: spool.id,
        usedGrams: 24,
        spoolPrice: spool.price,
        spoolWeight: spool.spoolWeight,
        inputMode: 'grams',
        usedMeters: undefined,
        diameter: spool.diameter,
        density: spool.density,
      },
    ],
    printTimeHours: 2,
    printTimeMinutes: 30,
    powerWatts: printer.watts,
    kwhRate: settings.kwhRate,
    failurePct: 10,
    machine: {
      mode: printer.wearMode,
      printerId: printer.id,
      directRate: printer.directRate,
      purchasePrice: printer.purchasePrice,
      maintenanceTotal: printer.maintenanceTotal,
      lifespanHours: printer.lifespanHours,
    },
    labor: {
      setupMinutes: 10,
      postMinutes: 15,
      ratePerHour: settings.laborRatePerHour,
      ratePresetId: f.laborRates[0].id,
    },
    hardware: [],
    packaging: {
      enabled: false,
      items: [],
      packingMinutes: 0,
      packingRatePerHour: 0,
      shippingPerUnit: 0,
    },
    pricing: {
      enabled: true,
      marginPct: 30,
      feePct: 10,
    },
  };
}

export function makeEmptyState(): AppState {
  const settings = defaultSettings();
  return {
    version: 1,
    settings,
    presets: defaultPresets(),
    products: [],
    draft: createEmptyDraft(settings),
    spoolDeductionLogId: 0,
  };
}