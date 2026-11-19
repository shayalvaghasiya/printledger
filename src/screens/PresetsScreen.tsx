// Presets / Libraries screen — reusable filament spools, printer profiles,
// labor rates and packaging materials. CRUD + filament remaining-grams tracking.

import { useState } from 'react';
import type {
  FilamentPreset,
  PrinterPreset,
  LaborPreset,
  PackPreset,
} from '../core/types';
import { formatMoney } from '../core/format';
import { useStore } from '../state/store';
import { Button, Modal, TextField, NumberField, Toggle, EmptyState, Hint } from '../ui/controls';
import { IconPlus, IconPencil, IconTrash, IconDice } from '../ui/icons';

type Tab = 'filaments' | 'printers' | 'labor' | 'packaging';

export function PresetsScreen({ currency }: { currency: string }) {
  const { state } = useStore();
  const [tab, setTab] = useState<Tab>('filaments');
  const p = state.presets;
  const money = (v: number) => formatMoney(v, currency);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'filaments', label: 'Filaments', count: p.filaments.length },
    { id: 'printers', label: 'Printers', count: p.printers.length },
    { id: 'labor', label: 'Labor rates', count: p.laborRates.length },
    { id: 'packaging', label: 'Packaging', count: p.packaging.length },
  ];

  return (
    <div>
      <div className="page-head rows">
        <div>
          <h1>Libraries</h1>
          <p className="muted">Reusable spools, printers, labor rates & packaging — reference-able from any calculation.</p>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label} <span className="tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'filaments' && <FilamentList money={money} />}
      {tab === 'printers' && <PrinterList money={money} />}
      {tab === 'labor' && <LaborList money={money} />}
      {tab === 'packaging' && <PackagingList money={money} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filaments
// ---------------------------------------------------------------------------

function FilamentList({ money }: { money: (v: number) => string }) {
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState<FilamentPreset | 'new' | null>(null);

  return (
    <div>
      <Button variant="primary" onClick={() => setEditing('new')}><IconPlus size={15} /> Add spool</Button>
      <div className="preset-list">
        {state.presets.filaments.map((f) => (
          <div className="preset-card" key={f.id}>
            <div className="preset-swatch" style={{ background: f.color || 'var(--accent)' }} />
            <div className="preset-body">
              <strong>{f.name}</strong>
              <small>{f.material} · {f.diameter} mm · {f.spoolWeight} g — {money(f.price)}</small>
              <small>
                Remaining: <strong style={{ color: f.remainingGrams !== null && f.remainingGrams < 100 ? 'var(--danger)' : undefined }}>{f.remainingGrams ?? '—'} g</strong>
                {' · '}{f.trackRemaining ? `track ${f.deductOnLog ? '+ auto-deduct on save' : ''}` : 'not tracked'}
              </small>
            </div>
            <div className="preset-actions">
              <button type="button" className="btn-icon" onClick={() => setEditing(f)} title="Edit"><IconPencil size={15} /></button>
              <button
                type="button"
                className="btn-icon danger"
                title="Delete"
                onClick={() => {
                  if (window.confirm(`Delete spool "${f.name}"? Products still pin their saved values, but new calculations can't select it.`)) {
                    dispatch({ type: 'preset/delete', collection: 'filaments', id: f.id });
                  }
                }}
              >
                <IconTrash size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {state.presets.filaments.length === 0 && (
        <EmptyState icon={<IconDice size={36} />} title="No filament spools" text="Add a spool with its price & weight to get per-gram costing." />
      )}

      {editing && (
        <FilamentEditor
          preset={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          money={money}
        />
      )}
    </div>
  );
}

function FilamentEditor({
  preset,
  onClose,
  money,
}: {
  preset: FilamentPreset | null;
  onClose: () => void;
  money: (v: number) => string;
}) {
  const { dispatch } = useStore();
  const [name, setName] = useState(preset?.name ?? '');
  const [material, setMaterial] = useState(preset?.material ?? 'PLA');
  const [color, setColor] = useState(preset?.color ?? '#e8803c');
  const [diameter, setDiameter] = useState(preset?.diameter ?? 1.75);
  const [density, setDensity] = useState(preset?.density ?? 1.24);
  const [price, setPrice] = useState(preset?.price ?? 0);
  const [spoolWeight, setSpoolWeight] = useState(preset?.spoolWeight ?? 1000);
  const [track, setTrack] = useState(preset?.trackRemaining ?? true);
  const [remaining, setRemaining] = useState(preset?.remainingGrams ?? 1000);
  const [deduct, setDeduct] = useState(preset?.deductOnLog ?? true);

  const save = () => {
    const data: FilamentPreset = {
      id: preset?.id ?? `fil-${Date.now().toString(36)}`,
      name: name.trim() || 'Unnamed spool',
      material: material.trim(),
      color,
      diameter: Math.max(0.1, diameter),
      density: Math.max(0.1, density),
      price: Math.max(0, price),
      spoolWeight: Math.max(1, spoolWeight),
      trackRemaining: track,
      remainingGrams: track ? remaining : null,
      deductOnLog: track && deduct,
    };
    dispatch({
      type: preset ? 'preset/update' : 'preset/add',
      collection: 'filaments',
      ...(preset ? { id: preset.id, patch: data } : { item: data }),
    } as never);
    onClose();
  };

  return (
    <Modal title={preset ? 'Edit spool' : 'Add spool'} onClose={onClose} footer={<Button variant="primary" onClick={save}>Save</Button>}>
      <div className="field-grid two">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PLA 1kg" />
        <TextField label="Material" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="PLA / PETG / ABS…" />
      </div>
      <div className="field-grid three">
        <TextField label="Color" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ padding: 4, height: 44 }} />
        <NumberField label="Diameter" value={diameter} onCommit={(v) => setDiameter(Math.max(0.1, v))} suffix="mm" />
        <NumberField label="Density" value={density} onCommit={(v) => setDensity(Math.max(0.1, v))} suffix="g/cm³" />
      </div>
      <div className="field-grid two">
        <NumberField label="Spool price" value={price} onCommit={setPrice} suffix="per spool" />
        <NumberField label="Spool weight" value={spoolWeight} onCommit={(v) => setSpoolWeight(Math.max(1, v))} suffix="g" />
      </div>
      {track && (
        <div className="field-grid two">
          <NumberField label="Remaining" value={remaining} onCommit={(v) => setRemaining(Math.max(0, v))} suffix="g" />
          <div className="field">
            <span className="field-label">Track remaining & auto-deduct on save</span>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Toggle checked={deduct} onChange={setDeduct} label="Deduct on production log" />
            </div>
          </div>
        </div>
      )}
      <Toggle checked={track} onChange={setTrack} label="Track remaining grams" description="Shows live spool remainder and deducts used filament when you save a batch" />
      {!track && <Hint>Remaining gram tracking is off — used grams won't be deducted when you save products.</Hint>}
      {money(price)} per {spoolWeight} g → {price / spoolWeight} per gram
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Printers
// ---------------------------------------------------------------------------

function PrinterList({ money }: { money: (v: number) => string }) {
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState<PrinterPreset | 'new' | null>(null);

  return (
    <div>
      <Button variant="primary" onClick={() => setEditing('new')}><IconPlus size={15} /> Add printer</Button>
      <div className="preset-list">
        {state.presets.printers.map((pr) => (
          <div className="preset-card" key={pr.id}>
            <div className="preset-body">
              <strong>{pr.name}</strong>
              <small>~{pr.watts} W avg draw</small>
              <small>
                {pr.wearMode === 'depreciation'
                  ? `(purchase ${money(pr.purchasePrice)} + maintenance ${money(pr.maintenanceTotal)}) ÷ ${pr.lifespanHours} h = ${money((pr.purchasePrice + pr.maintenanceTotal) / Math.max(1, pr.lifespanHours))}/h`
                  : `flat ${money(pr.directRate)}/h`}
              </small>
            </div>
            <div className="preset-actions">
              <button type="button" className="btn-icon" onClick={() => setEditing(pr)} title="Edit"><IconPencil size={15} /></button>
              <button type="button" className="btn-icon danger" title="Delete" onClick={() => window.confirm(`Delete "${pr.name}"?`) && dispatch({ type: 'preset/delete', collection: 'printers', id: pr.id })}><IconTrash size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <PrinterEditor preset={editing === 'new' ? null : editing} onClose={() => setEditing(null)} money={money} />
      )}
    </div>
  );
}

function PrinterEditor({
  preset,
  onClose,
  money,
}: {
  preset: PrinterPreset | null;
  onClose: () => void;
  money: (v: number) => string;
}) {
  const { dispatch } = useStore();
  const [name, setName] = useState(preset?.name ?? '');
  const [watts, setWatts] = useState(preset?.watts ?? 180);
  const [mode, setMode] = useState<'direct' | 'depreciation'>(preset?.wearMode ?? 'depreciation');
  const [directRate, setDirectRate] = useState(preset?.directRate ?? 4);
  const [purchasePrice, setPurchasePrice] = useState(preset?.purchasePrice ?? 0);
  const [maintenance, setMaintenance] = useState(preset?.maintenanceTotal ?? 0);
  const [lifespan, setLifespan] = useState(preset?.lifespanHours ?? 0);

  const save = () => {
    const data: PrinterPreset = {
      id: preset?.id ?? `pr-${Date.now().toString(36)}`,
      name: name.trim() || 'Unnamed printer',
      watts: Math.max(0, watts),
      wearMode: mode,
      directRate: Math.max(0, directRate),
      purchasePrice: Math.max(0, purchasePrice),
      maintenanceTotal: Math.max(0, maintenance),
      lifespanHours: Math.max(0, lifespan),
    };
    dispatch({
      type: preset ? 'preset/update' : 'preset/add',
      collection: 'printers',
      ...(preset ? { id: preset.id, patch: data } : { item: data }),
    } as never);
    onClose();
  };

  return (
    <Modal title={preset ? 'Edit printer' : 'Add printer'} onClose={onClose} footer={<Button variant="primary" onClick={save}>Save</Button>}>
      <div className="field-grid two">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Prusa MK4" />
        <NumberField label="Average power draw" value={watts} onCommit={(v) => setWatts(Math.max(0, v))} suffix="W" />
      </div>
      <div className="field">
        <span className="field-label">Wear model</span>
        <div className="seg">
          <button type="button" className={`seg-btn ${mode === 'depreciation' ? 'active' : ''}`} onClick={() => setMode('depreciation')}>Depreciation</button>
          <button type="button" className={`seg-btn ${mode === 'direct' ? 'active' : ''}`} onClick={() => setMode('direct')}>Flat rate</button>
        </div>
      </div>
      {mode === 'depreciation' ? (
        <div className="field-grid three">
          <NumberField label="Purchase price" value={purchasePrice} onCommit={(v) => setPurchasePrice(Math.max(0, v))} />
          <NumberField label="Maintenance total" value={maintenance} onCommit={(v) => setMaintenance(Math.max(0, v))} />
          <NumberField label="Lifespan" value={lifespan} onCommit={(v) => setLifespan(Math.max(0, v))} suffix="h" />
        </div>
      ) : (
        <NumberField label="Hourly rate" value={directRate} onCommit={(v) => setDirectRate(Math.max(0, v))} suffix="/h" />
      )}
      <Hint>
        {mode === 'depreciation' && lifespan > 0 ? `Effective rate: ${money((purchasePrice + maintenance) / lifespan)}/h` : 'Enter a lifespan to compute the hourly rate.'}
      </Hint>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Labor rates
// ---------------------------------------------------------------------------

function LaborList({ money }: { money: (v: number) => string }) {
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState<LaborPreset | 'new' | null>(null);

  return (
    <div>
      <Button variant="primary" onClick={() => setEditing('new')}><IconPlus size={15} /> Add rate</Button>
      <div className="preset-list">
        {state.presets.laborRates.map((r) => (
          <div className="preset-card" key={r.id}>
            <div className="preset-body">
              <strong>{r.name}</strong>
              <small>{money(r.ratePerHour)} / hour</small>
            </div>
            <div className="preset-actions">
              <button type="button" className="btn-icon" onClick={() => setEditing(r)} title="Edit"><IconPencil size={15} /></button>
              <button type="button" className="btn-icon danger" title="Delete" onClick={() => window.confirm(`Delete "${r.name}"?`) && dispatch({ type: 'preset/delete', collection: 'laborRates', id: r.id })}><IconTrash size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <LaborRateEditor preset={editing === 'new' ? null : editing} onClose={() => setEditing(null)} money={money} />
      )}
    </div>
  );
}

function LaborRateEditor({
  preset,
  onClose,
  money,
}: {
  preset: LaborPreset | null;
  onClose: () => void;
  money: (v: number) => string;
}) {
  const { dispatch } = useStore();
  const [name, setName] = useState(preset?.name ?? '');
  const [rate, setRate] = useState(preset?.ratePerHour ?? 0);
  const save = () => {
    dispatch({
      type: preset ? 'preset/update' : 'preset/add',
      collection: 'laborRates',
      ...(preset
        ? { id: preset.id, patch: { name: name.trim() || 'Labor rate', ratePerHour: Math.max(0, rate) } }
        : { item: { id: `lb-${Date.now().toString(36)}`, name: name.trim() || 'Labor rate', ratePerHour: Math.max(0, rate) } }),
    } as never);
    onClose();
  };
  return (
    <Modal title={preset ? 'Edit rate' : 'Add rate'} onClose={onClose} footer={<Button variant="primary" onClick={save}>Save</Button>}>
      <div className="field-grid two">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Workshop labor" />
        <NumberField label="Rate / hour" value={rate} onCommit={(v) => setRate(Math.max(0, v))} suffix="per hour" />
      </div>
      <Hint>Rate {money(Math.max(0, rate))}/h — {money(Math.max(0, rate) / 60)} per minute.</Hint>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Packaging
// ---------------------------------------------------------------------------

function PackagingList({ money }: { money: (v: number) => string }) {
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState<PackPreset | 'new' | null>(null);

  return (
    <div>
      <Button variant="primary" onClick={() => setEditing('new')}><IconPlus size={15} /> Add packaging item</Button>
      <div className="preset-list">
        {state.presets.packaging.map((pk) => (
          <div className="preset-card" key={pk.id}>
            <div className="preset-body">
              <strong>{pk.name}</strong>
              <small>{money(pk.unitCost)} / unit{pk.note ? ` · ${pk.note}` : ''}</small>
            </div>
            <div className="preset-actions">
              <button type="button" className="btn-icon" onClick={() => setEditing(pk)} title="Edit"><IconPencil size={15} /></button>
              <button type="button" className="btn-icon danger" title="Delete" onClick={() => window.confirm(`Delete "${pk.name}"?`) && dispatch({ type: 'preset/delete', collection: 'packaging', id: pk.id })}><IconTrash size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <PackEditor preset={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function PackEditor({
  preset,
  onClose,
}: {
  preset: PackPreset | null;
  onClose: () => void;
}) {
  const { dispatch } = useStore();
  const [name, setName] = useState(preset?.name ?? '');
  const [unitCost, setUnitCost] = useState(preset?.unitCost ?? 0);
  const [note, setNote] = useState(preset?.note ?? '');
  const save = () => {
    dispatch({
      type: preset ? 'preset/update' : 'preset/add',
      collection: 'packaging',
      ...(preset
        ? { id: preset.id, patch: { name: name.trim() || 'Packaging', unitCost: Math.max(0, unitCost), note: note.trim() } }
        : { item: { id: `pk-${Date.now().toString(36)}`, name: name.trim() || 'Packaging', unitCost: Math.max(0, unitCost), note: note.trim() } }),
    } as never);
    onClose();
  };
  return (
    <Modal title={preset ? 'Edit packaging item' : 'Add packaging item'} onClose={onClose} footer={<Button variant="primary" onClick={save}>Save</Button>}>
      <div className="field-grid two">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mailer box" />
        <NumberField label="Cost / unit" value={unitCost} onCommit={(v) => setUnitCost(Math.max(0, v))} />
      </div>
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 120×90×30 mm" />
      <Hint>Referenced by the packaging module in the calculator — price changes here propagate.</Hint>
    </Modal>
  );
}