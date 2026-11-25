import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';
import { Button } from './ui';
import { formatDateTime } from '../lib/format';

// What the grant is saying so far, at the top of the project, so someone about to write an
// answer can see the line the others have taken first.
//
// Rebuilding it costs an AI call, so it is cached on the project and only rebuilt on request.
// One rebuild per visit: the button spends itself, and the server refuses a second one over
// answers that have not changed, so a reload does not get around it either.
export default function AnswerSummary({ projectId, onOpenKickoff }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [spent, setSpent] = useState(false);
  // Guards the one automatic build below against React running effects twice in development.
  const tried = useRef(false);

  const build = useCallback(async (automatic) => {
    setBusy(true);
    try {
      const res = await api.post(`/api/projects/${projectId}/answer-summary`);
      setData(d => ({ ...d, ...res.data }));
      if (!automatic) toast.success(res.data.unchanged ? res.data.msg : 'Summary rebuilt.');
    } catch (err) {
      if (!automatic) toast.error(errorMessage(err, 'Could not build the summary.'));
    } finally {
      setBusy(false);
      setSpent(true);
    }
  }, [projectId, toast]);

  useEffect(() => {
    let cancelled = false;
    api.get(`/api/projects/${projectId}/answer-summary`)
      .then(r => {
        if (cancelled) return;
        setData(r.data);
        // First visit to a grant that has answers but no summary yet: build it once, quietly,
        // so it is simply there to read rather than something else to go and click.
        if (!r.data.text && r.data.enoughToSummarize && !tried.current) {
          tried.current = true;
          build(true);
        }
      })
      .catch(() => { if (!cancelled) setData({ text: null, enoughToSummarize: false }); });
    return () => { cancelled = true; };
  }, [projectId, build]);

  if (!data) return null;

  // Nobody has written anything yet, so there is nothing to summarise. Point at the two
  // things that do exist instead, and say plainly when neither of them does either.
  if (!data.text && !data.enoughToSummarize) {
    const guides = [data.hasAngle && 'the angle', data.kickoffNotes > 0 && `${data.kickoffNotes} kickoff note${data.kickoffNotes === 1 ? '' : 's'}`].filter(Boolean);
    const first = data.answerCount === 0;
    return (
      <div className="callout callout-indigo mb-3">
        <div className="label">{first ? "You're the first" : 'Only one answer so far'}</div>
        <div className="small mt-1">
          {first ? 'Nothing has been written on this grant yet. ' : 'Not enough written yet to tell you what the application is saying. '}
          {guides.length > 0 ? (
            <>
              Use {guides.join(' and ')} as your guide
              {onOpenKickoff && <> — <button type="button" className="link-button" onClick={onOpenKickoff}>open the kickoff</button></>}
              . Once two answers are in, this is where you will see what the application is arguing so far.
            </>
          ) : (
            <>
              There is no angle or kickoff note to go on either
              {onOpenKickoff && <>, so it is worth <button type="button" className="link-button" onClick={onOpenKickoff}>writing the angle first</button></>}
              {' '}— it shapes every answer Merge drafts for this grant.
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="callout callout-indigo mb-3">
      <div className="row-between">
        <div className="label">What this grant says so far</div>
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          disabled={busy || spent}
          onClick={() => build(false)}
          title={spent ? 'One rebuild per visit. Reopen the grant to do it again.' : 'Rebuild from the current answers'}
        >
          <RefreshCw size={14} strokeWidth={1.9} aria-hidden="true" /> Refresh
        </Button>
      </div>

      {data.text
        ? <div className="small mt-1 pre-wrap">{data.text}</div>
        : <div className="small mt-1 faint">{busy ? 'Reading the answers so far…' : 'Not put together yet.'}</div>}

      <div className="tiny muted mt-1">
        {data.generatedAt
          ? <>From {data.answerCount} answer{data.answerCount === 1 ? '' : 's'} · {formatDateTime(data.generatedAt)}{data.by ? ` · ${data.by}` : ''}</>
          : null}
        {data.stale && <> · <strong>answers have changed since this was written</strong></>}
        {spent && !busy && <> · one refresh per visit</>}
      </div>
    </div>
  );
}
