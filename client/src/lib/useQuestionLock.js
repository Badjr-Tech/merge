import { useCallback, useEffect, useRef, useState } from 'react';
import api, { sendOnExit } from '../api';

// One timer does both jobs: renewing the lock we hold and retrying one somebody else holds.
// The server lets a lock lapse after 90s, so renewing every 15s survives several dropped
// requests, and a blocked editor unlocks itself within 15s of the other person finishing
// instead of making the person reload the page to find out. It only ticks while a question
// editor is actually open.
const POLL_MS = 15 * 1000;

// How long a lock outlives the last sign of life from the person holding it. Renewing forever
// just because an editor is on screen is what made "someone is writing this" mean "someone
// opened this once": a question stayed claimed for as long as the tab was open, long after its
// writer had saved and moved on. Past this, the renewals stop and the lock is handed back.
// Comfortably longer than a pause for thought, and the first keystroke after it claims again.
const IDLE_MS = 2 * 60 * 1000;

// Claims one question while `active` is true, renews it while the person is still working, and
// gives it up on close, on an explicit release, or once they have gone quiet. Returns what the
// editor needs to decide whether to let the person type.
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
  // When the person last did something that counts as writing. Set on every claim so a freshly
  // opened editor starts with a full idle window.
  const lastActiveRef = useRef(Date.now());
  // Set once the idle window has passed, so the timer stops renewing instead of reclaiming on
  // its own. Only a touch clears it.
  const idleRef = useRef(false);

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

  const letGo = useCallback(() => {
    if (!mineRef.current) return;
    mineRef.current = false;
    setLock(l => ({ ...l, mine: false }));
    api.delete(`/api/projects/questions/${questionId}/lock`).catch(() => {});
  }, [questionId]);

  // Called by the editor on anything that means "still writing": focusing the box, typing in
  // it, saving. It is also what wakes a lock that was handed back for idleness.
  const touch = useCallback(() => {
    lastActiveRef.current = Date.now();
    if (idleRef.current) {
      idleRef.current = false;
      tryClaim();
    }
  }, [tryClaim]);

  // Handing it back on purpose: the editor closed, or the answer was saved and the person is no
  // longer in the box. Typing again reclaims it.
  const release = useCallback(() => {
    idleRef.current = true;
    letGo();
  }, [letGo]);

  useEffect(() => {
    if (!active || !questionId) return undefined;
    let stopped = false;
    lastActiveRef.current = Date.now();
    idleRef.current = false;
    setLock(l => ({ ...l, checking: true }));
    tryClaim(true);
    const t = setInterval(() => {
      if (stopped) return;
      // Gone quiet: stop holding the question and stop asking for it back. The lock is for
      // somebody writing, not for somebody who left an editor open.
      if (Date.now() - lastActiveRef.current > IDLE_MS) {
        if (!idleRef.current) { idleRef.current = true; letGo(); }
        return;
      }
      if (!idleRef.current) tryClaim();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
      if (mineRef.current) {
        mineRef.current = false;
        api.delete(`/api/projects/questions/${questionId}/lock`).catch(() => {});
      }
      idleRef.current = false;
      setLock({ mine: false, blockedBy: null, checking: false });
      baseRef.current = null;
    };
  }, [active, questionId, tryClaim, letGo]);

  // A closed laptop cannot send a release, which is why the server lock expires at all. Closing
  // a tab, though, should free the question at once -- and it did not: an ordinary request
  // started as the page unloads is cancelled along with the page, so this release never left
  // the browser and the question stayed claimed for its full 90 seconds. sendOnExit uses
  // fetch's keepalive so the browser finishes it after the page is gone.
  useEffect(() => {
    if (!active || !questionId) return undefined;
    const go = () => {
      if (!mineRef.current) return;
      mineRef.current = false;
      sendOnExit(`/api/projects/questions/${questionId}/lock`, 'DELETE');
    };
    window.addEventListener('pagehide', go);
    return () => window.removeEventListener('pagehide', go);
  }, [active, questionId]);

  return {
    // Only block typing when we know somebody else is in there.
    blockedBy: lock.blockedBy,
    holdsLock: lock.mine,
    base,
    setBase: rememberBase,
    touch,
    release,
    // Used after the conflict popup, where taking the newer version is the whole point.
    retry: () => tryClaim(true),
  };
}
