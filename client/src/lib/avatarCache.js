import api from '../api';

// Avatars live in private storage, so they are fetched with the auth header and turned into
// object URLs. An <img src> cannot send that header, which is why this exists rather than
// pointing the tag straight at the endpoint.
//
// One fetch per user per session: the cache is keyed by user id plus the time their picture
// last changed, so a new picture is a new key and the old entry simply stops being asked for.
const urls = new Map();   // key -> object URL
const inflight = new Map(); // key -> Promise

export function avatarKeyFor(user) {
  if (!user || !user.id || !user.avatarKey) return null;
  const v = user.avatarUpdatedAt ? new Date(user.avatarUpdatedAt).getTime() : 0;
  return `${user.id}:${v}`;
}

export function cachedAvatar(key) {
  return key ? urls.get(key) || null : null;
}

export function loadAvatar(user) {
  const key = avatarKeyFor(user);
  if (!key) return Promise.resolve(null);
  if (urls.has(key)) return Promise.resolve(urls.get(key));
  if (inflight.has(key)) return inflight.get(key);

  const p = api.get(`/api/users/${user.id}/avatar`, { responseType: 'blob' })
    .then(r => {
      const url = URL.createObjectURL(r.data);
      urls.set(key, url);
      return url;
    })
    .catch(() => null)
    .finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

// Called after someone changes their own picture so the old image stops being served.
export function forgetAvatar(userId) {
  for (const key of [...urls.keys()]) {
    if (key.startsWith(`${userId}:`)) {
      URL.revokeObjectURL(urls.get(key));
      urls.delete(key);
    }
  }
}
