import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Button } from './ui';
import { formatDate } from '../lib/format';

// Shows "you've answered something like this before" for a question, with one-click reuse.
export default function SimilarAnswers({ questionId, onUse }) {
  const [matches, setMatches] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/api/projects/questions/${questionId}/similar`).then(r => { if (!cancelled) setMatches(r.data); }).catch(() => { if (!cancelled) setMatches([]); });
    return () => { cancelled = true; };
  }, [questionId]);

  if (!matches || matches.length === 0) return null;

  return (
    <div className="callout callout-green mt-2 small">
      <div className="row-between mb-1">
        <strong>You've answered {matches.length === 1 ? 'a similar question' : 'similar questions'} before</strong>
        <Link to="/app/answer-bank" className="tiny">Open answer bank</Link>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {matches.map(m => (
          <div key={m.id} className="card card-pad" style={{ padding: 12 }}>
            <div className="row-between">
              <div className="grow">
                <div className="strong" style={{ color: 'var(--navy)' }}>{m.text}</div>
                <div className="tiny muted">{m.project.name} · {formatDate(m.updatedAt)} · {Math.round(m.score * 100)}% match</div>
              </div>
              <div className="row">
                <Button variant="ghost" size="sm" onClick={() => setOpenId(openId === m.id ? null : m.id)}>{openId === m.id ? 'Hide' : 'Preview'}</Button>
                <Button size="sm" onClick={() => onUse(m.answer)}>Use this answer</Button>
              </div>
            </div>
            {openId === m.id && <div className="q-answer small mt-1" style={{ maxHeight: 220, overflow: 'auto' }}>{m.answer}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
