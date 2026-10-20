// Vercel Blob storage. The store is private, so nothing here is reachable by URL alone —
// every read goes through the API, which checks the caller is in the right workspace first.
const { put, del, head } = require('@vercel/blob');

const token = () => process.env.BLOB_READ_WRITE_TOKEN;

function configured() {
  return Boolean(token());
}

// Pass the token explicitly: the SDK otherwise tries project OIDC, which is not available
// outside a Vercel deployment and fails locally.
async function putPrivate(pathname, body, contentType) {
  const r = await put(pathname, body, {
    access: 'private',
    addRandomSuffix: true,
    contentType: contentType || 'application/octet-stream',
    token: token(),
  });
  return r.pathname;
}

// Blobs are private, so this reads with the token and hands back the bytes for the API to
// stream on. Returns null when the blob is gone, so a missing picture degrades to initials
// rather than failing the whole request.
async function getBytes(pathname) {
  try {
    const meta = await head(pathname, { token: token() });
    const res = await fetch(meta.downloadUrl || meta.url, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) return null;
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType: meta.contentType };
  } catch {
    return null;
  }
}

async function remove(pathname) {
  if (!pathname) return;
  try { await del(pathname, { token: token() }); } catch { /* already gone is fine */ }
}

module.exports = { configured, putPrivate, getBytes, remove };
