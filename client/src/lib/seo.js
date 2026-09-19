import { useEffect } from 'react';

const SITE = 'https://www.mergeworkspace.com';
const DEFAULT_TITLE = 'Merge · Merge your workspace. Merge your teamwork.';
const DEFAULT_DESC = 'Merge your workspace. Write grants and proposals faster. Get funding easier. The shared workspace where teams split an application into questions, write together, and merge it into one finished proposal.';

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
    const [k, v] = selector.replace(/^(meta|link)\[/, '').replace(/\]$/, '').split('=');
    el.setAttribute(k, v.replace(/"/g, ''));
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

// Sets document title, description, canonical, Open Graph, and robots for a route.
export default function useSeo({ title, description, path = '/', noindex = false } = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} · Merge` : DEFAULT_TITLE;
    const desc = description || DEFAULT_DESC;
    document.title = fullTitle;
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', fullTitle);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:url"]', 'content', `${SITE}${path}`);
    setMeta('meta[name="twitter:title"]', 'content', fullTitle);
    setMeta('meta[name="twitter:description"]', 'content', desc);
    setMeta('link[rel="canonical"]', 'href', `${SITE}${path}`);
    setMeta('meta[name="robots"]', 'content', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
  }, [title, description, path, noindex]);
}
