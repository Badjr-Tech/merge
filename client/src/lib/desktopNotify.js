// Operating-system notifications, so an approver who is not looking at Merge still finds out
// that something is waiting. These come from the open tab, not a push service: they arrive
// while Merge is open in a browser somewhere, and stop when the last tab is closed.

const ENABLED_KEY = 'desktopNotify';
const SEEN_KEY = 'desktopNotifySeen';
const SEEN_MAX = 200;

export function supported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permission() {
  return supported() ? Notification.permission : 'unsupported';
}

export function enabled() {
  if (!supported() || Notification.permission !== 'granted') return false;
  try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch (e) { return false; }
}

export function setEnabled(on) {
  try { localStorage.setItem(ENABLED_KEY, on ? '1' : '0'); } catch (e) { /* private window */ }
}

// Browsers only grant permission from a real click, so this is always called from a button.
export async function request() {
  if (!supported()) return 'unsupported';
  const result = await Notification.requestPermission();
  setEnabled(result === 'granted');
  return result;
}

function readSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; }
}

function writeSeen(ids) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-SEEN_MAX))); } catch (e) { /* private window */ }
}

// Records ids without notifying. Used on the first load, so opening Merge does not fire one
// notification per item already sitting in the bell.
export function markSeen(ids) {
  const seen = readSeen();
  writeSeen([...seen, ...ids.filter(id => !seen.includes(id))]);
}

// Shows one notification per item that has not been seen before, and returns how many fired.
// `onOpen` runs when a notification is clicked, with that item.
export function notifyNew(items, onOpen) {
  if (!enabled()) return 0;
  const seen = readSeen();
  const fresh = items.filter(n => !n.readAt && !seen.includes(n.id));
  // A long quiet spell should not produce a wall of notifications; past three, say how many.
  const show = fresh.slice(0, 3);
  show.forEach(n => {
    try {
      const note = new Notification(n.title, { body: n.body || '', tag: `merge-${n.id}`, icon: '/logo192.png' });
      note.onclick = () => { try { window.focus(); } catch (e) { /* ignore */ } note.close(); if (onOpen) onOpen(n); };
    } catch (e) { /* a browser that refuses is no reason to break the bell */ }
  });
  if (fresh.length > show.length) {
    try { new Notification(`${fresh.length - show.length} more updates in Merge`, { tag: 'merge-overflow' }); } catch (e) { /* ignore */ }
  }
  writeSeen([...seen, ...fresh.map(n => n.id)]);
  return fresh.length;
}
