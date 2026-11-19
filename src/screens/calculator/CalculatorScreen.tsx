// Calculator screen — the heart of PrintLedger.
//
// Two-column workspace on desktop (inputs left, sticky summary right); single
// column + sticky bottom summary on mobile. All inputs patch the persisted
// `draft`, so the app never loses work. Cost modules (Production, Packaging,
// Pricing) are independent, collapsible sections.

import { useMemo, useRef, useState } from 'react';
import type {
  CostInput,
  FilamentLine,
  HardwareLine,
  PackLine,
  Presets,
  Product,
} from '../../core/types';
import {
  computeBreakdown,
  filamentLineCost,
  metersToGrams,
  machineHourlyRate,
  uid,
} from '../../core/costEngine';
import { formatMoney, formatHoursMinutes } from '../../core/format';
import { parseGcode } from '../../core/gcode';
import { parse3mf } from '../../core/gcode3mf';
import { useStore, planDeductions } from '../../state/store';
import {
  NumberField,
  TextField,
  SelectField,
  Toggle,
  Section,
  Button,
  Warning,
  Hint,
  Modal,
} from '../../ui/controls';
import { SummaryPanel } from '../../ui/SummaryPanel';
import {
  IconPlus,
  IconTrash,
  IconFileUp,
  IconPrinter3d,
  IconRefresh,
} from '../../ui/icons';

export interface EditContext {
  product: Product;
}

interface Props {
  editing: EditContext | null;
  onCancelEdit: () => void;
}

export function CalculatorScreen({ editing, onCancelEdit }: Props) {
  const { state, dispatch } = useStore();
  const draft = state.draft;
  const money = (v: number | null | undefined) => formatMoney(v, draft.currency);
  const breakdown = useMemo(() => computeBreakdown(draft), [draft]);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const set = (path: (string | number)[], value: unknown) =>
    dispatch({ type: 'draft/patch', path, value });

  return (
    <div className="calc-layout">
      <div className="calc-main">
        <div className="page-head">
          <div>
            <h1>{editing ? `Editing: ${editing.product.name}` : 'Cost Calculator'}</h1>
            <p className="muted">
              Transparent, per-unit costing — everything itemized, nothing hidden.
            </p>
          </div>
          {editing && (
            <Button variant="ghost" onClick={onCancelEdit}>
              ← Cancel edit
            </Button>
          )}
        </div>

        {/* Batch + actions */}
        <div className="card batch-bar">
          <div>
            <label className="field-label" htmlFor="batch-qty">Batch quantity</label>
            <div className="field-input-wrap" style={{ maxWidth: 150 }}>
              <input
                id="batch-qty"
                type="text"
                inputMode="numeric"
                className="field-input"
                value={String(draft.quantity)}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/[^\d]/g, '') || '0', 10);
                  dispatch({ type: 'draft/patch', path: ['quantity'], value: isNaN(n) ? 1 : n });
                }}
              />
            </div>
          </div>
          <div className="batch-bar-actions">
            <ImportSliceButton set={set} draft={draft} />
            <Button variant="ghost" onClick={() => dispatch({ type: 'draft/load', draft: freshDraftFrom(state) })}>
              <IconRefresh size={15} /> Reset draft
            </Button>
          </div>
        </div>

        <Section
          title={<><IconPrinter3d size={17} /> Base Print Cost</>}
          subtitle="Filament + electricity — always available"
          defaultOpen
        >
          <FilamentLines draft={draft} set={set} money={money} />

          <div className="divider" />

          <div className="field-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <NumberField id="ph" label="Print time" value={draft.printTimeHours} onCommit={(v) => set(['printTimeHours'], Math.max(0, v))} suffix="h" integer />
            <NumberField id="pm" label="minutes" value={draft.printTimeMinutes} onCommit={(v) => set(['printTimeMinutes'], Math.max(0, Math.min(59, Math.round(v))))} suffix="m" integer />
            <NumberField id="pw" label="Power draw" value={draft.powerWatts} onCommit={(v) => set(['powerWatts'], Math.max(0, v))} suffix="W" integer />
            <NumberField
              id="pk"
              label="Electricity rate"
              value={draft.kwhRate}
              onCommit={(v) => set(['kwhRate'], Math.max(0, v))}
              suffix="/kWh"
            />
          </div>
          <Hint>
            {formatHoursMinutes(draft.printTimeHours, draft.printTimeMinutes)} @ {draft.powerWatts} W ={' '}
            <strong>{money(breakdown.electricity)}</strong> electricity
          </Hint>
        </Section>

        <Section
          title={<><IconRefresh size={17} /> Production Cost</>}
          subtitle="Failure buffer · machine wear · labor & hardware"
          defaultOpen
        >
          <ProductionModule draft={draft} set={set} money={money} />
        </Section>

        <Section
          title={<><IconPlus size={17} /> Packaging Cost</>}
          subtitle="Independent module — toggle per calculation"
          defaultOpen={false}
          right={
            <Toggle
              checked={draft.packaging.enabled}
              onChange={(v) => set(['packaging', 'enabled'], v)}
              label=""
            />
          }
        >
          {draft.packaging.enabled ? (
            <PackagingModule draft={draft} set={set} money={money} />
          ) : (
            <Hint>Turn this on to add packaging items, packing labor and shipping.</Hint>
          )}
        </Section>

        <Section
          title={<><IconFileUp size={17} /> Pricing</>}
          subtitle="Margin target + marketplace fees → suggested price"
          defaultOpen={false}
          right={
            <Toggle
              checked={draft.pricing.enabled}
              onChange={(v) => set(['pricing', 'enabled'], v)}
              label=""
            />
          }
        >
          <PricingModule draft={draft} set={set} money={money} breakdown={breakdown} />
        </Section>
      </div>

      <div className="calc-side">
        <SummaryPanel breakdown={breakdown} draft={draft} money={money} />
        <div className="rail-actions">
          <SaveBlock
            draft={draft}
            editing={editing}
            onCancelEdit={onCancelEdit}
          />
        </div>
      </div>

      {/* Mobile: sticky bottom summary */}
      <button type="button" className="sticky-summary" onClick={() => setSummaryOpen(true)}>
        <span className="sticky-unit">{money(breakdown.unitTotal)} / unit</span>
        {draft.quantity > 1 && <span className="sticky-batch">× {draft.quantity} = {money(breakdown.batchTotal)}</span>}
        {draft.pricing.enabled && breakdown.price !== null && <span className="sticky-price">sell {money(breakdown.price)}</span>}
      </button>

      {summaryOpen && (
        <Modal title="Cost breakdown" onClose={() => setSummaryOpen(false)} wide>
          <SummaryPanel breakdown={breakdown} draft={draft} money={money} />
          <div className="modal-spacer" />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft factory (uses current presets/settings to seed sensible defaults)
// ---------------------------------------------------------------------------

export function freshDraftFrom(state: { presets: Presets; settings: { kwhRate: number; laborRatePerHour: number }; currency?: string }): CostInput {
  const f = state.presets.filaments[0];
  const printer = state.presets.printers[0];
  const labor = state.presets.laborRates[0];
  return {
    currency: state.currency ?? 'USD',
    quantity: 1,
    filament: [
      {
        id: uid('line'),
        name: f?.name ?? 'Filament',
        source: f ? 'preset' : 'custom',
        spoolId: f?.id,
        usedGrams: 24,
        spoolPrice: f?.price ?? 0,
        spoolWeight: f?.spoolWeight ?? 1000,
        inputMode: 'grams',
        diameter: f?.diameter,
        density: f?.density,
      },
    ],
    printTimeHours: 2,
    printTimeMinutes: 30,
    powerWatts: printer?.watts ?? 180,
    kwhRate: state.settings.kwhRate,
    failurePct: 10,
    machine: {
      mode: printer?.wearMode ?? 'depreciation',
      printerId: printer?.id,
      directRate: printer?.directRate ?? 4,
      purchasePrice: printer?.purchasePrice ?? 0,
      maintenanceTotal: printer?.maintenanceTotal ?? 0,
      lifespanHours: printer?.lifespanHours ?? 0,
    },
    labor: {
      setupMinutes: 10,
      postMinutes: 15,
      ratePerHour: labor?.ratePerHour ?? state.settings.laborRatePerHour,
      ratePresetId: labor?.id,
    },
    hardware: [],
    packaging: {
      enabled: false,
      items: [],
      packingMinutes: 0,
      packingRatePerHour: 0,
      shippingPerUnit: 0,
    },
    pricing: { enabled: true, marginPct: 30, feePct: 10 },
  };
}

// ---------------------------------------------------------------------------
// Filament lines
// ---------------------------------------------------------------------------

function FilamentLines({
  draft,
  set,
  money,
}: {
  draft: CostInput;
  set: (path: (string | number)[], value: unknown) => void;
  money: (v: number | null | undefined) => string;
}) {
  const { state } = useStore();
  const spools = state.presets.filaments;

  const patchLine = (i: number, patch: Partial<FilamentLine>) =>
    set(['filament', i], { ...draft.filament[i], ...patch });

  const onSpoolSelect = (i: number, spoolId: string) => {
    if (spoolId === '__custom__') {
      patchLine(i, { source: 'custom', spoolId: undefined });
      return;
    }
    const spool = spools.find((s) => s.id === spoolId);
    if (!spool) return;
    patchLine(i, {
      source: 'preset',
      spoolId: spool.id,
      name: spool.name,
      spoolPrice: spool.price,
      spoolWeight: spool.spoolWeight,
      diameter: spool.diameter,
      density: spool.density,
      usedGrams: draft.filament[i].inputMode === 'meters' ? draft.filament[i].usedGrams : draft.filament[i].usedGrams,
    });
  };

  return (
    <div className="line-list">
      {draft.filament.map((line, i) => {
        const lineCost = filamentLineCost(line);
        const spoolRemaining =
          line.source === 'preset'
            ? spools.find((s) => s.id === line.spoolId)?.remainingGrams
            : undefined;
        return (
          <div className="line-card" key={line.id}>
            <div className="line-card-head">
              <span className="line-title">Filament {i + 1}</span>
              <span className="line-cost">{money(lineCost)}</span>
              <button
                type="button"
                className="btn-icon"
                aria-label="Remove filament"
                disabled={draft.filament.length === 1}
                onClick={() => set(['filament'], draft.filament.filter((_, j) => j !== i))}
              >
                <IconTrash size={15} />
              </button>
            </div>

            <div className="field-grid two">
              <SelectField
                label="Spool"
                id={`spool-${i}`}
                value={line.source === 'preset' ? (line.spoolId ?? '') : '__custom__'}
                onChange={(e) => onSpoolSelect(i, e.target.value)}
              >
                {spools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="__custom__">Custom spool…</option>
              </SelectField>

              <div className="seg">
                <button
                  type="button"
                  className={`seg-btn ${line.inputMode === 'grams' ? 'active' : ''}`}
                  onClick={() => patchLine(i, { inputMode: 'grams' })}
                >
                  grams
                </button>
                <button
                  type="button"
                  className={`seg-btn ${line.inputMode === 'meters' ? 'active' : ''}`}
                  onClick={() => patchLine(i, { inputMode: 'meters' })}
                >
                  metres
                </button>
              </div>
            </div>

            {line.inputMode === 'grams' ? (
              <div className="field-grid two">
                <NumberField
                  id={`grams-${i}`}
                  label="Used per unit"
                  value={line.usedGrams}
                  onCommit={(v) => patchLine(i, { usedGrams: Math.max(0, v) })}
                  suffix="g"
                />
                {spoolRemaining !== undefined && (
                  <div className="remaining-cell">
                    <span className="field-label">Remaining on spool</span>
                    <strong className={(spoolRemaining ?? 0) < 0 ? 'neg' : ''}>{Math.round(spoolRemaining ?? 0)} g</strong>
                  </div>
                )}
              </div>
            ) : (
              <div className="field-grid two">
                <NumberField
                  id={`meters-${i}`}
                  label="Length used"
                  value={line.usedMeters ?? 0}
                  onCommit={(v) => {
                    const m = Math.max(0, v);
                    patchLine(i, {
                      usedMeters: m,
                      usedGrams: Math.round(metersToGrams(m, line.diameter, line.density) * 10) / 10,
                    });
                  }}
                  suffix="m"
                />
                <div className="remaining-cell">
                  <span className="field-label">≈ grams</span>
                  <strong>{money !== undefined ? '' : ''}{fmt(metersToGrams(line.usedMeters ?? 0, line.diameter, line.density), 1)} g</strong>
                </div>
              </div>
            )}

            {line.source === 'custom' && (
              <div className="field-grid two">
                <NumberField label="Spool price" id={`sp-${i}`} value={line.spoolPrice} onCommit={(v) => patchLine(i, { spoolPrice: Math.max(0, v) })} suffix="per spool" />
                <NumberField label="Spool weight" id={`sw-${i}`} value={line.spoolWeight} onCommit={(v) => patchLine(i, { spoolWeight: Math.max(1, v) })} suffix="g" />
              </div>
            )}
          </div>
        );
      })}

      <Button
        variant="ghost"
        onClick={() =>
          set(['filament'], [...draft.filament, emptyFilamentLine(spools[0])])
        }
      >
        <IconPlus size={15} /> Add filament
      </Button>
    </div>
  );
}

function emptyFilamentLine(spool: Presets['filaments'][number] | undefined): FilamentLine {
  return {
    id: uid('line'),
    name: spool?.name ?? 'Filament',
    source: spool ? 'preset' : 'custom',
    spoolId: spool?.id,
    usedGrams: 20,
    spoolPrice: spool?.price ?? 0,
    spoolWeight: spool?.spoolWeight ?? 1000,
    inputMode: 'grams',
    diameter: spool?.diameter,
    density: spool?.density,
  };
}

function fmt(n: number, d = 1): string {
  return Number.isFinite(n) ? n.toFixed(d) : '0.0';
}

// ---------------------------------------------------------------------------
// Production module
// ---------------------------------------------------------------------------

function ProductionModule({
  draft,
  set,
  money,
}: {
  draft: CostInput;
  set: (path: (string | number)[], value: unknown) => void;
  money: (v: number | null | undefined) => string;
}) {
  const { state } = useStore();
  const printers = state.presets.printers;
  const machine = draft.machine;
  const hourly = machineHourlyRate(machine);

  const pickPrinter = (id: string) => {
    if (id === '__custom__') {
      set(['machine'], { ...machine, printerId: undefined, mode: 'depreciation' });
      return;
    }
    const p = printers.find((x) => x.id === id);
    if (!p) return;
    set(['machine'], {
      mode: p.wearMode,
      printerId: p.id,
      directRate: p.directRate,
      purchasePrice: p.purchasePrice,
      maintenanceTotal: p.maintenanceTotal,
      lifespanHours: p.lifespanHours,
    });
  };

  return (
    <div>
      <div className="field-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
        <div className="field">
          <span className="field-label">Failure rate buffer</span>
          <div className="slider-row">
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={draft.failurePct}
              onChange={(e) => set(['failurePct'], Number(e.target.value))}
              aria-label="Failure rate percentage"
            />
            <span className="slider-val">{draft.failurePct}%</span>
          </div>
          <Hint>Applied to filament + electricity + machine costs only.</Hint>
        </div>
      </div>

      <div className="divider" />

      <h4 className="subhead">Machine wear &amp; depreciation</h4>
      <div className="field-grid two">
        <SelectField
          label="Printer profile"
          id="printer-pick"
          value={machine.printerId ?? '__custom__'}
          onChange={(e) => pickPrinter(e.target.value)}
        >
          {printers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          <option value="__custom__">Custom / manual…</option>
        </SelectField>

        <SelectField
          label="Wear model"
          id="machine-mode"
          value={machine.mode}
          onChange={(e) => set(['machine', 'mode'], e.target.value as 'direct' | 'depreciation')}
        >
          <option value="depreciation">Depreciation (purchase ÷ lifespan)</option>
          <option value="direct">Flat hourly rate</option>
        </SelectField>
      </div>

      {machine.mode === 'depreciation' ? (
        <div className="field-grid three">
          <NumberField id="mpurchase" label="Purchase price" value={machine.purchasePrice} onCommit={(v) => set(['machine', 'purchasePrice'], Math.max(0, v))} />
          <NumberField id="mmaint" label="Maintenance total" value={machine.maintenanceTotal} onCommit={(v) => set(['machine', 'maintenanceTotal'], Math.max(0, v))} />
          <NumberField id="mlife" label="Lifespan" value={machine.lifespanHours} onCommit={(v) => set(['machine', 'lifespanHours'], Math.max(0, v))} suffix="h" />
        </div>
      ) : (
        <NumberField id="mdirect" label="Machine rate per hour" value={machine.directRate} onCommit={(v) => set(['machine', 'directRate'], Math.max(0, v))} suffix="/h" />
      )}
      <Hint>
        Hourly machine rate: <strong>{money(hourly.rate)}/h</strong>
        {hourly.source === 'not-set' && ' (enter a purchase price & lifespan to compute it)'}
      </Hint>

      <div className="divider" />

      <h4 className="subhead">Labor &amp; post-processing</h4>
      <div className="field-grid two">
        <NumberField label="Setup" id="lsetup" value={draft.labor.setupMinutes} onCommit={(v) => set(['labor', 'setupMinutes'], Math.max(0, Math.round(v)))} suffix="min" integer />
        <NumberField label="Post-processing" id="lpost" value={draft.labor.postMinutes} onCommit={(v) => set(['labor', 'postMinutes'], Math.max(0, Math.round(v)))} suffix="min" integer />
      </div>
      <div className="field-grid two">
        <SelectField
          label="Labor rate"
          id="lrate-preset"
          value={draft.labor.ratePresetId ?? '__custom__'}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              set(['labor'], { ...draft.labor, ratePresetId: undefined });
              return;
            }
            const r = state.presets.laborRates.find((x) => x.id === e.target.value);
            if (r) set(['labor'], { ...draft.labor, ratePresetId: r.id, ratePerHour: r.ratePerHour });
          }}
        >
          {state.presets.laborRates.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
          <option value="__custom__">Custom…</option>
        </SelectField>
        <NumberField label="Rate / hour" id="lrate" value={draft.labor.ratePerHour} onCommit={(v) => set(['labor', 'ratePerHour'], Math.max(0, v))} suffix="/h" />
      </div>

      <div className="divider" />

      <h4 className="subhead">Extra hardware / components</h4>
      <HardwareLines draft={draft} set={set} money={money} />
    </div>
  );
}

function HardwareLines({
  draft,
  set,
  money,
}: {
  draft: CostInput;
  set: (path: (string | number)[], value: unknown) => void;
  money: (v: number | null | undefined) => string;
}) {
  const lines = draft.hardware;
  const upd = (i: number, patch: Partial<HardwareLine>) =>
    set(['hardware', i], { ...lines[i], ...patch });

  if (lines.length === 0) return <Hint>None — add magnets, screws, inserts, adhesives…</Hint>;

  return (
    <div className="line-list">
      {lines.map((line, i) => (
        <div className="line-card slim" key={line.id}>
          <TextField placeholder="Part name" value={line.name} onChange={(e) => upd(i, { name: e.target.value })} />
          <NumberField label="Qty" value={line.qty} onCommit={(v) => upd(i, { qty: Math.max(1, Math.round(v)) })} suffix="×" integer style={{ maxWidth: 110 }} />
          <NumberField label="Unit cost" value={line.unitCost} onCommit={(v) => upd(i, { unitCost: Math.max(0, v) })} style={{ maxWidth: 140 }} />
          <span className="line-cost">{money(line.qty * line.unitCost)}</span>
          <button type="button" className="btn-icon" aria-label="Remove part" onClick={() => set(['hardware'], lines.filter((_, j) => j !== i))}>
            <IconTrash size={15} />
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => set(['hardware'], [...lines, { id: uid('hw'), name: '', qty: 1, unitCost: 0 }])}>
        <IconPlus size={15} /> Add part
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Packaging module
// ---------------------------------------------------------------------------

function PackagingModule({
  draft,
  set,
  money,
}: {
  draft: CostInput;
  set: (path: (string | number)[], value: unknown) => void;
  money: (v: number | null | undefined) => string;
}) {
  const { state } = useStore();
  const pack = draft.packaging;
  const items = pack.items;
  const upd = (i: number, patch: Partial<PackLine>) => set(['packaging', 'items', i], { ...items[i], ...patch });

  return (
    <div>
      <div className="field-grid two">
        <NumberField label="Packing labor" id="plab" value={pack.packingMinutes} onCommit={(v) => set(['packaging', 'packingMinutes'], Math.max(0, Math.round(v)))} suffix="min" integer />
        <NumberField label="Packing rate" id="prate" value={pack.packingRatePerHour} onCommit={(v) => set(['packaging', 'packingRatePerHour'], Math.max(0, v))} suffix="/h" />
      </div>
      <NumberField label="Shipping estimate (per unit)" id="pship" value={pack.shippingPerUnit} onCommit={(v) => set(['packaging', 'shippingPerUnit'], Math.max(0, v))} />

      <h4 className="subhead">Packaging items</h4>
      <div className="line-list">
        {items.map((item, i) => (
          <div className="line-card slim" key={item.id}>
            <TextField placeholder="Item name" value={item.name} onChange={(e) => upd(i, { name: e.target.value })} />
            <NumberField label="Qty" value={item.qty} onCommit={(v) => upd(i, { qty: Math.max(1, Math.round(v)) })} suffix="×" integer style={{ maxWidth: 110 }} />
            <NumberField label="Unit cost" value={item.unitCost} onCommit={(v) => upd(i, { unitCost: Math.max(0, v) })} style={{ maxWidth: 140 }} />
            <span className="line-cost">{money(item.qty * item.unitCost)}</span>
            <button type="button" className="btn-icon" aria-label="Remove item" onClick={() => set(['packaging', 'items'], items.filter((_, j) => j !== i))}>
              <IconTrash size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="inline-actions">
        <Button variant="ghost" onClick={() => set(['packaging', 'items'], [...items, { id: uid('pk'), name: '', qty: 1, unitCost: 0 }])}>
          <IconPlus size={15} /> Custom line
        </Button>
        <SelectField
          label="From library"
          id="pack-library"
          value=""
          onChange={(e) => {
            const p = state.presets.packaging.find((x) => x.id === e.target.value);
            if (p)
              set(['packaging', 'items'], [...items, { id: uid('pk'), name: p.name, qty: 1, unitCost: p.unitCost, itemId: p.id }]);
          }}
        >
          <option value="">Choose…</option>
          {state.presets.packaging.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {money(p.unitCost)}</option>
          ))}
        </SelectField>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing module
// ---------------------------------------------------------------------------

function PricingModule({
  draft,
  set,
  money,
  breakdown,
}: {
  draft: CostInput;
  set: (path: (string | number)[], value: unknown) => void;
  money: (v: number | null | undefined) => string;
  breakdown: ReturnType<typeof computeBreakdown>;
}) {
  const p = draft.pricing;
  const guard = p.marginPct + p.feePct >= 100;
  return (
    <div>
      <div className="field-grid two">
        <NumberField label="Target profit margin" id="pmargin" value={p.marginPct} onCommit={(v) => set(['pricing', 'marginPct'], Math.max(0, Math.min(95, v)))} suffix="%" integer />
        <NumberField label="Marketplace / payment fee" id="pfee" value={p.feePct} onCommit={(v) => set(['pricing', 'feePct'], Math.max(0, Math.min(95, v)))} suffix="%" integer />
      </div>
      {guard && <Warning>Margin + fees must sum below 100%.</Warning>}
      {!guard && breakdown.price !== null && (
        <div className="mini-summary">
          <div className="mini-row"><span>Selling price</span><strong>{money(breakdown.price)}</strong></div>
          <div className="mini-row"><span>After {p.feePct}% fee</span><span>{money(breakdown.grossPerUnit)}</span></div>
          <div className="mini-row"><span>Net profit / unit</span><strong className={breakdown.netProfitPerUnit !== null && breakdown.netProfitPerUnit < 0 ? 'neg' : ''}>{money(breakdown.netProfitPerUnit)}</strong></div>
          {draft.quantity > 1 && <div className="mini-row"><span>Net × batch</span><strong>{money(breakdown.netProfitBatch)}</strong></div>}
        </div>
      )}
      <Hint>
        Price = unit cost ÷ (1 − fee − margin), so margin is {p.marginPct}% of the selling price after fees.
      </Hint>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import .gcode / .3mf
// ---------------------------------------------------------------------------

function ImportSliceButton({
  draft,
  set,
}: {
  draft: CostInput;
  set: (path: (string | number)[], value: unknown) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".gcode,.gcodex,.gco,.3mf"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const is3mf = file.name.toLowerCase().endsWith('.3mf');
            const result = is3mf
              ? parse3mf(new Uint8Array(await file.arrayBuffer()))
              : parseGcode(await file.text());
            setWarnings(result.warnings.length ? result.warnings : null);
            const patches: (string | number)[][] = [];
            const vals: unknown[] = [];

            if (result.timeSeconds !== null) {
              const h = Math.floor(result.timeSeconds / 3600);
              const m = Math.round((result.timeSeconds % 3600) / 60);
              if (h >= 0 && m <= 59) {
                patches.push(['printTimeHours'], ['printTimeMinutes']);
                vals.push(h, m);
              }
            }
            if ((result.grams !== null || result.meters !== null) && draft.filament.length > 0) {
              let grams = result.grams;
              if (grams === null && result.meters !== null && result.meters > 0) {
                const l = draft.filament[0];
                grams = Math.round(metersToGrams(result.meters, l.diameter, l.density) * 10) / 10;
              }
              if (grams !== null && grams > 0) {
                const rounded = Math.round(grams * 10) / 10;
                const current = draft.filament[0];
                set(['filament', 0], { ...current, usedGrams: rounded, inputMode: 'grams' });
              }
            }
            patches.forEach((p, i) => set(p, vals[i]));
          } catch (err) {
            setWarnings([err instanceof Error ? err.message : 'Could not read this file.']);
          }
        }}
      />
      <Button variant="primary" onClick={() => inputRef.current?.click()} title="Import print time & filament use from a .gcode or .3mf file">
        <IconFileUp size={15} /> Import slice
      </Button>
      {warnings && (
        <div className="import-warning">
          <Warning>{warnings.join(' ')}</Warning>
          <button type="button" className="btn-icon" onClick={() => setWarnings(null)} aria-label="Dismiss">×</button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Save product
// ---------------------------------------------------------------------------

export function SaveBlock({
  draft,
  editing,
  onCancelEdit,
}: {
  draft: CostInput;
  editing: EditContext | null;
  onCancelEdit: () => void;
}) {
  const { dispatch, state } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [revNote, setRevNote] = useState('');

  const openModal = () => {
    setName(editing?.product.name ?? '');
    setSku(editing?.product.sku ?? '');
    setCategory(editing?.product.category ?? '');
    setTags(editing?.product.tags.join(', ') ?? '');
    setNotes(editing?.product.notes ?? '');
    setRevNote('');
    setOpen(true);
  };

  const doSave = (mode: 'new' | 'overwrite' | 'version') => {
    const meta = {
      name: name.trim() || 'Untitled product',
      sku: sku.trim(),
      category: category.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      notes,
    };
    dispatch({
      type: 'product/save',
      id: mode === 'new' ? undefined : editing?.product.id,
      draft,
      meta,
      mode,
      note: revNote,
    });
    // "Deduct on production log": saving a new product or a new version means a
    // batch is being produced, so tracked spools lose their grams. Overwriting a
    // product record just fixes its numbers — no new material was consumed.
    if (mode !== 'overwrite') {
      const deductions = planDeductions(state.presets, draft, draft.quantity)
        .filter((d) => {
          const spool = state.presets.filaments.find((f) => f.id === d.spoolId);
          return !!spool?.deductOnLog;
        })
        .map((d) => ({ spoolId: d.spoolId, grams: d.grams }));
      dispatch({ type: 'preset/deduct', deductions });
    }
    setOpen(false);
    onCancelEdit();
  };

  // Live preview of what this save would deduct (planDeductions uses only
  // `trackRemaining` spools; the actual save also respects `deductOnLog`).
  const pendingDeductions = useMemo(
    () => planDeductions(state.presets, draft, draft.quantity).filter((d) => {
      const spool = state.presets.filaments.find((f) => f.id === d.spoolId);
      return !!spool?.deductOnLog;
    }),
    [state.presets, draft, draft.quantity],
  );

  return (
    <>
      <Button variant="primary" onClick={openModal}>
        {editing ? 'Update product…' : 'Save product…'}
      </Button>
      {open && (
        <Modal
          title={editing ? `Save "${editing.product.name}"` : 'Save this calculation'}
          onClose={() => setOpen(false)}
          footer={
            <div className="modal-save-buttons">
              {editing ? (
                <>
                  <Button variant="secondary" onClick={() => doSave('overwrite')} title="Replace the current version, keeping history">
                    Overwrite
                  </Button>
                  <Button variant="primary" onClick={() => doSave('version')}>Save as new version</Button>
                </>
              ) : (
                <Button variant="primary" onClick={() => doSave('new')}>Create product</Button>
              )}
              {editing && (
                <Button variant="ghost" onClick={() => doSave('new')}>Save as new product…</Button>
              )}
            </div>
          }
        >
          <div className="field-grid two">
            <TextField label="Product name" id="sv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Earbud stand v2" autoFocus />
            <TextField label="SKU" id="sv-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. EB-2" />
          </div>
          <div className="field-grid two">
            <TextField label="Category" id="sv-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Home" />
            <TextField label="Tags (comma-separated)" id="sv-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="gift, desk" />
          </div>
          <TextField label="Notes" id="sv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          {editing && (
            <TextField label="Revision note (for this change)" id="sv-rev" value={revNote} onChange={(e) => setRevNote(e.target.value)} placeholder="e.g. switched to PETG" />
          )}
          {pendingDeductions.length > 0 && (
            <Hint>
              This save works as a production-log entry and will deduct:{' '}
              {pendingDeductions.map((d) => `${d.name} −${Math.round(d.grams)} g`).join(', ')}
              {draft.quantity > 1 ? ` (× ${draft.quantity} units)` : ''}.
            </Hint>
          )}
        </Modal>
      )}
    </>
  );
}