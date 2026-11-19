// Costa breaakdown panel: itemized rows for every engine line, plus totals.

import type { CostBreakdown, CostInput } from '../core/types';
import { computeBreakdown } from '../core/costEngine';
import { formatMoney } from '../core/format';
import { IconAlertTriangle, IconCheck } from './icons';

function Row({
  label,
  value,
  strong,
  sub,
  warn,
}: {
  label: string;
  value: string;
  strong?: boolean;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className={`sum-row ${strong ? 'strong' : ''} ${warn ? 'warn' : ''}`}>
      <span className="sum-label">
        {label}
        {sub && <small>{sub}</small>}
      </span>
      <span className="sum-value">{value}</span>
    </div>
  );
}

export function SummaryPanel({
  breakdown,
  draft,
  money,
}: {
  breakdown: CostBreakdown;
  draft: CostInput;
  money: (v: number | null | undefined) => string;
}) {
  const b = breakdown;
  const quantity = Math.max(0, draft.quantity);
  const showBatch = quantity > 1;
  return (
    <aside className="summary-panel">
      <div className="sum-head">
        <span className="sum-title">Breakdown</span>
        {draft.packaging.enabled && (
          <span className="sum-badge">+ packaging</span>
        )}
      </div>

      <div className="sum-group">
        <Row label="Filament" value={money(b.filament)} />
        <Row label="Electricity" value={money(b.electricity)} />
        <Row label="Machine wear" value={money(b.machine)} />
        <Row label="Failure buffer" sub={`${draft.failurePct}% of print/machine`} value={money(b.failure)} />
        <Row label="Labor & post-processing" value={money(b.labor)} />
        <Row label="Hardware / components" value={money(b.hardware)} />
      </div>

      <Row label="Total production cost" strong value={money(b.productionCost)} />

      {draft.packaging.enabled && (
        <>
          <div className="sum-group">
            <Row label="Packaging items" value={money(b.packagingItems)} />
            <Row label="Packing labor" value={money(b.packagingLabor)} />
            <Row label="Shipping estimate" value={money(b.packagingShipping)} />
          </div>
          <Row label="Packaging total" value={money(b.packagingCost)} />
        </>
      )}

      <Row label="Grand total / unit" strong value={money(b.unitTotal)} />

      {showBatch && (
        <Row label={`Batch total × ${quantity}`} strong value={money(b.batchTotal)} />
      )}

      {draft.pricing.enabled && b.price !== null && (
        <div className="sum-pricing">
          <Row label="Suggested selling price" strong value={money(b.price)} />
          <Row label="Net profit / unit" value={money(b.netProfitPerUnit)} />
          {showBatch && <Row label={`Net profit × ${quantity}`} value={money(b.netProfitBatch)} />}
          {b.landedMarginPct !== null && (
            <Row label="Landed margin" sub="after fee" value={`${b.landedMarginPct.toFixed(1)}%`} />
          )}
        </div>
      )}

      {draft.pricing.enabled && b.price === null && (
        <div className="sum-guard">
          <IconAlertTriangle size={15} />
          Margin + fees ≥ 100% — adjust pricing inputs.
        </div>
      )}

      {!draft.pricing.enabled && (
        <div className="sum-off">
          <IconCheck size={14} /> Pricing off
        </div>
      )}
    </aside>
  );
}

/** Convenience: format a number with the draft's currency. */
export function moneyOf(draft: CostInput) {
  return (v: number | null | undefined) => formatMoney(v, draft.currency);
}

export type { CostBreakdown };
export { computeBreakdown };