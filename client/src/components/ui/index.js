import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { initials, displayName } from '../../lib/format';

export function Button({ variant = 'primary', size, block, as, to, href, children, className = '', loading, ...rest }) {
  const cls = `btn btn-${variant} ${size ? `btn-${size}` : ''} ${block ? 'btn-block' : ''} ${className}`;
  if (to) return <Link to={to} className={cls} {...rest}>{children}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{children}</a>;
  return (
    <button type="button" className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading && <span className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} />}
      {children}
    </button>
  );
}

export function Card({ children, className = '', pad, onClick, ...rest }) {
  return (
    <div className={`card ${pad ? 'card-pad' : ''} ${onClick ? 'card-clickable' : ''} ${className}`} onClick={onClick} {...rest}>
      {children}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function Input(props) { return <input className={`input ${props.className || ''}`} {...props} />; }
export function Textarea(props) { return <textarea className={`textarea ${props.className || ''}`} {...props} />; }
export function Select({ children, ...props }) { return <select className={`select ${props.className || ''}`} {...props}>{children}</select>; }

export function Badge({ tone = 'gray', children, dot }) {
  return <span className={`badge badge-${tone}`}>{dot && <span className="dot" style={{ background: 'currentColor' }} />}{children}</span>;
}

export function Avatar({ user, size }) {
  return <span className={`avatar ${size ? `avatar-${size}` : ''}`} title={displayName(user)}>{initials(user)}</span>;
}

export function Progress({ value, tone }) {
  return <div className={`progress ${tone || ''}`}><div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div className="loading-block"><span className="spinner" /> {label}</div>;
}

export function ErrorBlock({ message, retry }) {
  return (
    <div className="callout callout-danger row-between">
      <span>{message}</span>
      {retry && <Button variant="danger" size="sm" onClick={retry}>Try again</Button>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => (
        <button key={t.id} role="tab" className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)} aria-selected={active === t.id}>
          {t.label}{t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header"><h3>{title}</h3><button className="close-x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant={danger ? 'danger-solid' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>
    }>
      <p className="mb-0">{message}</p>
    </Modal>
  );
}

export function useConfirm() {
  const [state, setState] = useState({ open: false });
  const confirm = (opts) => new Promise((resolve) => {
    setState({ open: true, ...opts, resolve });
  });
  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      danger={state.danger}
      onClose={() => { state.resolve && state.resolve(false); setState({ open: false }); }}
      onConfirm={() => { state.resolve && state.resolve(true); setState({ open: false }); }}
    />
  );
  return [confirm, dialog];
}

export function CopyButton({ text, label = 'Copy link' }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button variant="secondary" size="sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
    }}>{copied ? 'Copied!' : label}</Button>
  );
}
