import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api';

// One timer does both jobs: renewing the lock we hold and retrying one somebody else holds.
// The server lets a lock lapse after 90s, so renewing every 15s survives several dropped
// requests, and a blocked editor unlocks itself within 15s of the other person finishing
// instead of making the person reload the page to find out. It only ticks while a question
// editor is actually open.
const POLL_MS = 15 * 1000;

// Claims one question while `active` is true, renews it while the editor stays open, and gives
// it up on close. Returns what the editor needs to decide whether to let the person type.
//
// `base` is the updatedAt of the answer the person is writing from. It travels with their save
// so the server can tell a normal save from one landing on top of someone else's newer text.
export default function useQuestionLock(questionId, active) {
  const [lock, setLock] = useState({ mine: false, blockedBy: null, checking: false });
  const [base, setBase] = useState(null);
  // Read inside tryClaim, which would otherwise close over a stale `base`.
  const baseRef = useRef(null);
  const rememberBase = useCallback((v) => { baseRef.current = v; setBase(v); }, []);
  // Held in a ref as well so the cleanup can release without `mine` being a dependency, which
  // would tear the lock down and rebuild it on every state change.
  const mineRef = useRef(false);

  // `resetBase` is the difference between arriving at a question and merely still being in it.
  // A renewal must NOT move the version the person is writing from: if someone else's text
  // landed in the meantime, adopting it here would quietly make their save look clean and
  // overwrite that text with no warning. Only opening the question, or choosing to refresh
  // after a conflict, moves the baseline.
  const tryClaim = useCallback(async (resetBase = false) => {
    try {
      const r = await api.post(`/api/projects/questions/${questionId}/lock`);
      mineRef.current = true;
      setLock({ mine: true, blockedBy: null, checking: false });
      if (r.data && r.data.updatedAt && (resetBase || baseRef.current === null)) rememberBase(r.data.updatedAt);
      return true;
    } catch (err) {
      const d = (err.response && err.response.data) || {};
      if (err.response && err.response.status === 409 && d.lockedBy) {
        mineRef.current = false;
        setLock({ mine: false, blockedBy: d.lockedBy, checking: false });
        return false;
      }
      // Anything else (offline, a 500) should not pretend somebody is in the question. Let the
      // person write: the server still refuses a save that would overwrite newer text.
      mineRef.current = false;
      setLock({ mine: false, blockedBy: null, checking: false });
      return false;
    }
  }, [questionId, rememberBase]);

  useEffect(() => {
    if (!active || !questionId) return undefined;
    let stopped = false;
    setLock(l => ({ ...l, checking: true }));
    tryClaim(true);
    const t = setInterval(() => { if (!stopped) tryClaim(); }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
      if (mineRef.current) {
        mineRef.current = false;
        api.delete(`/api/projects/questions/${questionId}/lock`).catch(() => {});
      }
      setLock({ mine: false, blockedBy: null, checking: false });
      baseRef.current = null;
    };
  }, [active, questionId, tryClaim]);

  // A closed laptop cannot send a release, which is why the server lock expires. Doing it here
  // too means the common case, closing the tab, frees the question at once.
  useEffect(() => {
    if (!active || !questionId) return undefined;
    const go = () => { if (mineRef.current) api.delete(`/api/projects/questions/${questionId}/lock`).catch(() => {}); };
    window.addEventListener('pagehide', go);
    return () => window.removeEventListener('pagehide', go);
  }, [active, questionId]);

  return {
    // Only block typing when we know somebody else is in there.
    blockedBy: lock.blockedBy,
    holdsLock: lock.mine,
    base,
    setBase: rememberBase,
    // Used after the conflict popup, where taking the newer version is the whole point.
    retry: () => tryClaim(true),
  };
}
