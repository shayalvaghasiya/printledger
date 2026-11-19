// Shared UI primitives — fields, buttons, toggle, section, modal.
// All styling lives in styles/theme.css; these components are just behavior +
// accessibility (labels, inputMode, aria for switches/modals).

import {
  useState,
  useEffect,
  type ReactNode,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ButtonHTMLAttributes,
} from 'react';
import { IconChevronDown, IconX, IconAlertTriangle } from './icons';

// ---------------------------------------------------------------------------
// Number field
// ---------------------------------------------------------------------------

interface NumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onCommit: (value: number) => void;
  label?: string;
  suffix?: string;
  allowNegative?: boolean;
  integer?: boolean;
}

/**
 * A numeric input that keeps the raw text while focused (so typing "12." or a
 * partial value doesn't fight the cursor) and commits a parsed number on blur.
 * Enter also commits. Invalid input snaps back to the last valid value.
 */
export function NumberField({
  value,
  onCommit,
  label,
  suffix,
  allowNegative = false,
  integer = false,
  id,
  ...rest
}: NumberFieldProps) {
  const [text, setText] = useState(String(value ?? ''));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value ?? ''));
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const cleaned = text.trim().replace(/,/g, '.');
    if (!cleaned) {
      onCommit(0);
      setText(String(value ?? ''));
      return;
    }
    let n = Number(cleaned);
    if (!Number.isFinite(n)) {
      setText(String(value ?? ''));
      return;
    }
    if (integer) n = Math.round(n);
    if (!allowNegative && n < 0) n = 0;
    onCommit(n);
    setText(String(n));
  };

  return (
    <label className="field" htmlFor={id}>
      {label && <span className="field-label">{label}</span>}
      <div className="field-input-wrap">
        <input
          id={id}
          {...rest}
          type="text"
          inputMode="decimal"
          className={`field-input ${suffix ? 'has-suffix' : ''}`}
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(/,/g, '.'));
            if (Number.isFinite(n)) onCommit(n < 0 && !allowNegative ? 0 : n);
          }}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Text / select / textarea
// ---------------------------------------------------------------------------

export function TextField({
  label,
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="field" htmlFor={id}>
      {label && <span className="field-label">{label}</span>}
      <input id={id} className="field-input" {...rest} />
    </label>
  );
}

export function SelectField({
  label,
  children,
  id,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="field" htmlFor={id}>
      {label && <span className="field-label">{label}</span>}
      <div className="select-wrap">
        <select id={id} className="field-input select" {...rest}>
          {children}
        </select>
        <IconChevronDown size={15} className="select-arrow" />
      </div>
    </label>
  );
}

export function TextAreaField({
  label,
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="field" htmlFor={id}>
      {label && <span className="field-label">{label}</span>}
      <textarea id={id} className="field-input textarea" rows={3} {...rest} />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return <button className={`btn btn-${variant} ${className}`} {...rest} />;
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">
        {label}
        {description && <span className="toggle-desc">{description}</span>}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

export function Section({
  title,
  subtitle,
  defaultOpen = true,
  open,
  onToggle,
  right,
  children,
  icon,
}: {
  title: ReactNode;
  subtitle?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (next: boolean) => void;
  right?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
}) {
  const [internal, setInternal] = useState(defaultOpen);
  const isOpen = open !== undefined ? open : internal;

  return (
    <section className={`section ${isOpen ? 'open' : ''}`}>
      <div className="section-head">
        <button
          type="button"
          className="section-title-btn"
          aria-expanded={isOpen}
          onClick={() => {
            if (onToggle) onToggle(!isOpen);
            else setInternal(!isOpen);
          }}
          style={{ flex: '1 1 0' }}
        >
          {icon}
          <span className="section-title-text">
            <span className="section-title">{title}</span>
            {subtitle && <span className="section-subtitle">{subtitle}</span>}
          </span>
        </button>
        {right}
        <IconChevronDown size={18} className={`section-chevron ${isOpen ? 'open' : ''}`} />
      </div>
      {isOpen && <div className="section-body">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  // Close on Escape; lock scroll; click outside closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`modal ${wide ? 'wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <IconX size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline alert / hint
// ---------------------------------------------------------------------------

export function Warning({ children }: { children: ReactNode }) {
  return (
    <div className="alert alert-warning">
      <IconAlertTriangle size={16} />
      <span>{children}</span>
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="hint">{children}</p>;
}

// ---------------------------------------------------------------------------
// Chip / badge / empty state
// ---------------------------------------------------------------------------

export function Chip({ label }: { label: string }) {
  return <span className="chip">{label}</span>;
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field groups
// ---------------------------------------------------------------------------

export function FieldGrid({ children, cols }: { children: ReactNode; cols?: number }) {
  return <div className="field-grid" style={cols ? { gridTemplateColumns: cols } : undefined}>{children}</div>;
}

export function InlineAmount({ value, children }: { value: ReactNode; children?: ReactNode }) {
  return (
    <span className="inline-amount">
      <span className="amount">{value}</span>
      {children}
    </span>
  );
}

export { IconChevronDown, IconX };