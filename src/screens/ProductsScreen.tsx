// Products screen — saved products with search/filter/sort, duplicate/edit,
// revision history, and "Recalculate with Current Rates" before/after deltas.

import { useMemo, useState } from 'react';
import type { Product } from '../core/types';
import { computeBreakdown } from '../core/costEngine';
import { formatMoney, formatPercent, formatDate } from '../core/format';
import { useStore, computeRecalc } from '../state/store';
import { EmptyState, Button, Modal, SelectField, TextField, Warning, Hint, Chip } from '../ui/controls';
import {
  IconBoxes,
  IconSearch,
  IconTrash,
  IconPencil,
  IconCopy,
  IconRefresh,
  IconPlus,
} from '../ui/icons';

interface Props {
  /** Switch to the calculator with a fresh draft (create a new product). */
  onNewProduct: () => void;
  /** Load a product's snapshot into the calculator to edit/save updates. */
  onEditProduct: (p: Product) => void;
}

type SortKey = 'updated' | 'cost' | 'batch' | 'margin' | 'name';

export function ProductsScreen({ onNewProduct, onEditProduct }: Props) {
  const { state, dispatch } = useStore();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<SortKey>('updated');
  const [detail, setDetail] = useState<Product | null>(null);

  const products = state.products;
  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = products.filter((p) => {
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q));
      const matchCat = category === 'all' || p.category === category;
      return matchQ && matchCat;
    });
    const unit = (p: Product) => p.snapshot.breakdown.unitTotal;
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'name': return a.name.localeCompare(b.name);
        case 'cost': return unit(a) - unit(b);
        case 'batch': return a.snapshot.breakdown.batchTotal - b.snapshot.breakdown.batchTotal;
        case 'margin': return (a.snapshot.breakdown.landedMarginPct ?? -1e9) - (b.snapshot.breakdown.landedMarginPct ?? -1e9);
        default: return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
  }, [products, query, category, sort]);

  return (
    <div>
      <div className="page-head rows">
        <div>
          <h1>Saved Products</h1>
          <p className="muted">{products.length} saved {products.length === 1 ? 'product' : 'products'} · stored locally, offline-first</p>
        </div>
        <Button variant="primary" onClick={onNewProduct} title="Reset the calculator to a fresh draft">
          <IconPlus size={15} /> New product
        </Button>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <IconSearch size={16} />
          <input type="search" placeholder="Search name, SKU or tag…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <SelectField label="Category" id="prod-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
        <SelectField label="Sort" id="prod-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="updated">Recently updated</option>
          <option value="name">Name A–Z</option>
          <option value="cost">Unit cost</option>
          <option value="batch">Batch total</option>
          <option value="margin">Margin</option>
        </SelectField>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconBoxes size={40} />}
          title={products.length === 0 ? 'No products yet' : 'No matches'}
          text={
            products.length === 0
              ? 'Build a cost in the Calculator, then hit "Save product" — or import a JSON backup from Settings.'
              : 'Try adjusting your search or filters.'
          }
          action={
            products.length === 0 ? (
              <Button variant="primary" onClick={onNewProduct}>Open the calculator</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="products-list">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              onOpen={() => setDetail(p)}
              onEdit={() => onEditProduct(p)}
              onDuplicate={() => dispatch({ type: 'product/duplicate', id: p.id })}
              onDelete={() => {
                if (window.confirm(`Delete "${p.name}"? This cannot be undone.`)) {
                  dispatch({ type: 'product/delete', id: p.id });
                }
              }}
              onRecalc={() => setDetail(p)}
            />
          ))}
        </div>
      )}

      {detail && (
        <ProductDetailModal
          key={detail.snapshot.computedAt + detail.updatedAt}
          p={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function ProductCard({
  p,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
  onRecalc,
}: {
  p: Product;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRecalc: () => void;
}) {
  const b = p.snapshot.breakdown;
  const q = p.snapshot.input.quantity;
  const currency = p.snapshot.input.currency;

  const metrics = [
    { label: 'Unit', value: formatMoney(b.unitTotal, currency) },
    ...(q > 1 ? [{ label: `Batch × ${q}`, value: formatMoney(b.batchTotal, currency) }] : []),
    ...(p.snapshot.input.packaging.enabled ? [{ label: 'Packaging', value: formatMoney(b.packagingCost, currency) }] : []),
    ...(b.price !== null ? [{ label: 'Price', value: formatMoney(b.price, currency) }] : []),
    ...(b.landedMarginPct !== null ? [{ label: 'Margin', value: formatPercent(b.landedMarginPct, 0) }] : []),
  ];

  return (
    <article className="product-card">
      <button type="button" className="product-main" onClick={onOpen}>
        <div className="product-headline">
          <span className="product-name">{p.name}</span>
          {p.sku && <span className="sku">{p.sku}</span>}
          {p.category && <Chip label={p.category} />}
        </div>
        <div className="product-metrics">
          {metrics.map((it) => (
            <span key={it.label} className="metric"><small>{it.label}</small><strong>{it.value}</strong></span>
          ))}
        </div>
      </button>
      <div className="product-actions">
        <button type="button" className="btn-icon" title="Edit cost & save updates" onClick={onEdit}><IconPencil size={16} /></button>
        <button type="button" className="btn-icon" title="Duplicate as a variant" onClick={onDuplicate}><IconCopy size={16} /></button>
        <button type="button" className="btn-icon" title="Recalculate with current rates" onClick={onRecalc}><IconRefresh size={16} /></button>
        <button type="button" className="btn-icon danger" title="Delete" onClick={onDelete}><IconTrash size={16} /></button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Detail modal: metrics, recalc (with save options), revision history
// ---------------------------------------------------------------------------

export function ProductDetailModal({ p, onClose }: { p: Product; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const b = p.snapshot.breakdown;
  const q = p.snapshot.input.quantity;
  const currency = p.snapshot.input.currency;
  const [showRecalc, setShowRecalc] = useState(false);
  const [revNote, setRevNote] = useState('');

  const recalc = useMemo(() => computeRecalc(state, p.id), [state, p.id]);
  const newInput = recalc?.newInput;

  const allVersions = [
    { id: 'current', at: p.updatedAt, note: 'Current version', snapshot: p.snapshot },
    ...p.history,
  ];

  const saveViaRecalc = (mode: 'version' | 'overwrite') => {
    if (!newInput) return;
    dispatch({
      type: 'product/save',
      id: p.id,
      draft: newInput,
      meta: { name: p.name, sku: p.sku, category: p.category, tags: p.tags, notes: p.notes },
      mode,
      note: revNote || 'Recalculated with current rates',
    });
    setShowRecalc(false);
    setRevNote('');
  };

  return (
    <Modal
      title={p.name}
      onClose={onClose}
      wide
    >
      {p.sku && <Chip label={`SKU ${p.sku}`} />}
      {p.category && <Chip label={p.category} />}
      {p.tags.map((t) => <Chip key={t} label={t} />)}

      <div className="detail-metrics">
        {[
          { label: 'Unit cost', value: formatMoney(b.unitTotal, currency) },
          ...(q > 1 ? [{ label: `Batch × ${q}`, value: formatMoney(b.batchTotal, currency) }] : []),
          { label: 'Production', value: formatMoney(b.productionCost, currency) },
          { label: 'Packaging', value: formatMoney(b.packagingCost, currency) },
          ...(b.price !== null ? [{ label: 'Selling price', value: formatMoney(b.price, currency) }] : []),
          ...(b.netProfitPerUnit !== null ? [{ label: 'Net / unit', value: formatMoney(b.netProfitPerUnit, currency) }] : []),
        ].map((m) => (
          <div key={m.label} className="detail-metric"><small>{m.label}</small><strong>{m.value}</strong></div>
        ))}
      </div>

      {p.notes && <p className="product-notes">{p.notes}</p>}
      <Hint>Created {formatDate(p.createdAt)} · Updated {formatDate(p.updatedAt)}</Hint>

      {/* Recalculate with current rates */}
      <div className="recalc-block">
        <button type="button" className="recalc-toggle" onClick={() => setShowRecalc((v) => !v)}>
          <IconRefresh size={16} /> Recalculate with current rates
        </button>
        {showRecalc && (
          recalc && newInput ? (
            <div className="recalc-panel">
              {recalc.deltas.length === 0 ? (
                <Hint>No rate changes since this product version — the cost is already current.</Hint>
              ) : (
                <>
                  <div className="delta-list">
                    {recalc.deltas.map((d, i) => (
                      <div key={i} className="delta-row">
                        <span>{d.label}</span>
                        <span className="delta-old">{formatMoney(d.old, currency)}</span>
                        <span>→</span>
                        <span className="delta-new">{formatMoney(d.new, currency)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="delta-total">
                    <span>Unit cost</span>
                    <span className="delta-old">{formatMoney(b.unitTotal, currency)}</span>
                    <span>→</span>
                    <span className="delta-new">{formatMoney(computeBreakdown(newInput).unitTotal, currency)}</span>
                  </div>
                  <TextField label="Revision note" value={revNote} onChange={(e) => setRevNote(e.target.value)} placeholder="e.g. spool price went up" />
                  <Warning>Save as a new version keeps the old costing in history; overwrite replaces it in place.</Warning>
                  <div className="modal-save-buttons">
                    <Button variant="primary" onClick={() => saveViaRecalc('version')}>Save as new version</Button>
                    <Button variant="secondary" onClick={() => saveViaRecalc('overwrite')} title="Replace the current version, keeping history">Overwrite current</Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Hint>Nothing to recalculate yet.</Hint>
          )
        )}
      </div>

      {/* Revision history */}
      {allVersions.length > 1 && (
        <div className="history">
          <h4 className="subhead">Revision history</h4>
          {allVersions.map((rev, i) => {
            const prev = allVersions[i + 1]?.snapshot.breakdown.unitTotal ?? null;
            const curr = rev.snapshot.breakdown.unitTotal;
            const delta = prev !== null ? curr - prev : null;
            return (
              <div key={rev.id} className={`history-row ${rev.id === 'current' ? 'current' : ''}`}>
                <div>
                  <strong>{rev.id === 'current' ? 'Current' : formatDate(rev.at)}</strong>
                  {rev.note && <span>{rev.note}</span>}
                </div>
                <div className="history-values">
                  <span>{formatMoney(curr, rev.snapshot.input.currency)}</span>
                  {delta !== null && (
                    <span className={delta <= 0 ? 'delta-ok' : 'delta-up'}>
                      {delta > 0 ? '+' : ''}{formatMoney(delta, rev.snapshot.input.currency)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// re-export so the calculator can reuse the edit flow
export type { Product };
export { computeBreakdown };