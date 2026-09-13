import { useEffect } from 'react';

const SITE = 'https://mergev1-78hi.vercel.app';
const DEFAULT_TITLE = 'Merge · Grant proposals, written together';
const DEFAULT_DESC = 'Grant-writing software for nonprofits, consultants, and solo grant writers. Turn an RFP into questions, keep answers inside word limits, reuse past answers, get approvals, and download a finished proposal.';

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
