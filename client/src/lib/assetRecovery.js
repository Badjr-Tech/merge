// A tab left open across a deploy still has the old index.html, which points at script and style
// files that no longer exist — they 404, and the page renders blank or unstyled until a refresh.
// Fetching the current index.html gets the new filenames, so one reload fixes it. Guarded by a
// timestamp so a genuinely missing file can never put the page in a reload loop.
const KEY = 'merge:asset-reload';
const COOLDOWN_MS = 60 * 1000;

export default function installAssetRecovery() {
  window.addEventListener('error', (event) => {
    const el = event.target;
    if (!el || !el.tagName) return;
    const tag = el.tagName.toLowerCase();
    if (tag !== 'script' && tag !== 'link') return;
    const url = el.src || el.href || '';
    if (!url.startsWith(window.location.origin)) return;
    if (tag === 'link' && el.rel !== 'stylesheet') return;

    let last = 0;
    try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch (_) { /* private mode */ }
    if (Date.now() - last < COOLDOWN_MS) return;
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch (_) { /* ignore */ }

    // eslint-disable-next-line no-console
    console.warn('Merge asset missing, reloading for the current build:', url);
    window.location.reload();
  }, true); // capture: resource errors do not bubble
}
