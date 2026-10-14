import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Everything the draft left for the writer to fill in. The answer box is a plain textarea, so
// the brackets cannot be styled where they sit — this lists them underneath instead, which is
// what stops one going out in a submitted application.
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

export default function Placeholders({ text }) {
  const items = findPlaceholders(text);
  if (!items.length) return null;
  return (
    <div className="callout callout-gold mt-1">
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <AlertTriangle size={16} strokeWidth={1.9} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>{items.length} {items.length === 1 ? 'thing' : 'things'} to fill in</strong>
          <div className="tiny mt-1">
            {items.map((label, i) => (
              <span key={i} className="placeholder-chip">[{label}]</span>
            ))}
          </div>
          <div className="tiny muted mt-1">Replace each one with a real value before you submit.</div>
        </div>
      </div>
    </div>
  );
}
