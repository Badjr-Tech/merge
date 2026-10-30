import React, { useState } from 'react';
import { AlertTriangle, Check, Wand2 } from 'lucide-react';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';

// Everything the draft left for the writer to fill in, each one fillable here rather than
// hunted for in the text. Typing a value replaces every occurrence of that placeholder in
// the answer, so the writer never has to find the brackets themselves.
//
// This edits the text directly rather than asking the model to rewrite: it is instant, costs
// no AI allowance, and cannot undo edits the writer has already made by hand.
const PATTERN = /\[([^[\]\n]{2,120})\]/g;

export function findPlaceholders(text) {
  const found = [];
  const seen = new Set();
  let m;
  PATTERN.lastIndex = 0;
  while ((m = PATTERN.exec(text || '')) !== null) {
    const label = m[1].trim();
    const key = label.toLowerCase();
    if (label && !seen.has(key)) { seen.add(key); found.push(label); }
  }
  return found;
}

// Replaces [label] wherever it appears. The label is escaped so a placeholder containing
// regex characters — "[cost (USD)]" — is matched literally rather than as a pattern.
export function fillPlaceholder(text, label, value) {
  const safe = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text || '').replace(new RegExp(`\\[\\s*${safe}\\s*\\]`, 'g'), value);
}

export default function Placeholders({ text, onChange, onLocate, projectId }) {
  const toast = useToast();
  const items = findPlaceholders(text);
  const [open, setOpen] = useState(null);
  const [value, setValue] = useState('');
  const [filled, setFilled] = useState(0);
  const [tidying, setTidying] = useState(false);

  // Once the last one is filled the panel would vanish, so the tidy offer lives on until the
  // writer uses or ignores it.
  const tidy = async () => {
    setTidying(true);
    try {
      const r = await api.post('/api/ai/tidy', { text, projectId });
      // The server refuses to return a shortened answer, but guard here too: this replaces
      // text the writer can see, and losing their work to a bad reply is not recoverable.
      const next = (r.data.text || '').trim();
      const shrank = next.split(/\s+/).filter(Boolean).length < text.split(/\s+/).filter(Boolean).length * 0.8;
      if (!next || shrank || r.data.unchanged) {
        toast.success('Left as it was — nothing needed changing.');
      } else if (next !== text) {
        onChange(next);
        toast.success('Tidied the wording around what you filled in.');
      } else {
        toast.success('That already reads cleanly.');
      }
      setFilled(0);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not tidy that answer.'));
    } finally {
      setTidying(false);
    }
  };

  if (!items.length) {
    if (!filled || !onChange) return null;
    return (
      <div className="callout callout-green mt-1">
        <div className="row-between" style={{ gap: 8 }}>
          <span className="small"><strong>All filled in.</strong> Tidy the wording around the values if you like.</span>
          <button type="button" className="ph-tidy" onClick={tidy} disabled={tidying}>
            <Wand2 size={13} strokeWidth={2} aria-hidden="true" /> {tidying ? 'Tidying…' : 'Tidy wording'}
          </button>
        </div>
      </div>
    );
  }

  const start = (label) => { setOpen(label); setValue(''); };

  const commit = () => {
    if (!open || !value.trim() || !onChange) return;
    onChange(fillPlaceholder(text, open, value.trim()));
    setFilled(n => n + 1);
    setOpen(null);
    setValue('');
  };

  return (
    <div className="callout callout-gold mt-1">
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <AlertTriangle size={16} strokeWidth={1.9} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong>{items.length} {items.length === 1 ? 'thing' : 'things'} to fill in</strong>
          <div className="tiny mt-1">
            {items.map((label) => (open === label ? (
              <span key={label} className="ph-fill">
                <input
                  autoFocus
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commit(); }
                    if (e.key === 'Escape') { setOpen(null); setValue(''); }
                  }}
                  placeholder={label}
                  aria-label={`Value for ${label}`}
                />
                <button type="button" onClick={commit} disabled={!value.trim()} aria-label="Use this value">
                  <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                </button>
              </span>
            ) : (
              <button
                key={label}
                type="button"
                className="placeholder-chip"
                onClick={() => { if (onLocate) onLocate(`[${label}]`); if (onChange) start(label); }}
                title={onChange ? 'Click to fill this in' : undefined}
                disabled={!onChange}
              >
                [{label}]
              </button>
            )))}
          </div>
          <div className="tiny muted mt-1">
            {onChange ? 'Click one, type the real value, and it drops into the answer.' : 'Replace each one with a real value before you submit.'}
          </div>
        </div>
      </div>
    </div>
  );
}
