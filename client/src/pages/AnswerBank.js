import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { Badge, Card, CopyButton, EmptyState, ErrorBlock, Input, Loading, PageHeader } from '../components/ui';
import { displayName, formatDate, wordCount } from '../lib/format';

export default function AnswerBank() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setError('');
      api.get('/api/projects/answers/bank', { params: { q } }).then(r => setRows(r.data)).catch(err => setError(errorMessage(err)));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <PageHeader title="Answer bank" subtitle="Every answer your team has written in Merge, searchable and ready to reuse. Type a question to find the closest past answers." />
      <Input placeholder="Search past questions and answers, e.g. 'describe your evaluation plan'…" value={q} onChange={e => setQ(e.target.value)} className="mb-3" autoFocus />
      {error && <ErrorBlock message={error} />}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && <Card><EmptyState icon="◫" title={q ? 'No matching answers' : 'No answers yet'}>{q ? 'Try different words. Matching looks at the question wording first.' : 'Answers written in any project show up here once they are saved.'}</EmptyState></Card>}
      {rows && rows.length > 0 && (
        <div className="stack">
          {rows.map(r => (
            <Card key={r.id} pad>
              <div className="row-between">
                <div className="grow">
                  <div className="q-text">{r.text}</div>
                  <div className="q-meta">
                    <Link to={`/app/projects/${r.project.id}`}>{r.project.name}</Link>
                    <span>· {displayName(r.assignedTo)}</span>
                    <span>· {formatDate(r.updatedAt)}</span>
                    <span>· {wordCount(r.answer)} words</span>
                    {r.score !== undefined && q && <Badge tone={r.score >= 0.5 ? 'green' : 'gray'}>{Math.round(r.score * 100)}% match</Badge>}
                    {r.project.isCompleted && <Badge tone="indigo">Completed project</Badge>}
                  </div>
                </div>
                <div className="row">
                  <button className="link-button small" onClick={() => setOpenId(openId === r.id ? null : r.id)}>{openId === r.id ? 'Hide' : 'Show answer'}</button>
                  <CopyButton text={r.answer} label="Copy answer" />
                </div>
              </div>
              {openId === r.id ? (
                <div className="q-answer">{r.answer}</div>
              ) : (
                <div className="q-answer small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.answer}</div>
              )}
            </Card>
          ))}
        </div>
      )}
      <p className="tiny faint mt-3">Tip: when you open a question inside a project, Merge automatically shows similar answers from here.</p>
    </div>
  );
}
