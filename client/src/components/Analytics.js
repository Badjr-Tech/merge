import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Cookie-free analytics via Plausible. Set REACT_APP_PLAUSIBLE_DOMAIN to enable; nothing loads otherwise.
const DOMAIN = process.env.REACT_APP_PLAUSIBLE_DOMAIN;

export default function Analytics() {
  const location = useLocation();
  useEffect(() => {
    if (!DOMAIN || document.getElementById('plausible')) return;
    const s = document.createElement('script');
    s.id = 'plausible'; s.defer = true; s.setAttribute('data-domain', DOMAIN);
    s.src = 'https://plausible.io/js/script.manual.js';
    document.head.appendChild(s);
    window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
  }, []);
  useEffect(() => {
    if (!DOMAIN || !window.plausible) return;
    // Do not send private app URLs; only the section is useful
    const path = location.pathname.startsWith('/app') ? '/app' : location.pathname.startsWith('/review') ? '/review' : location.pathname;
    window.plausible('pageview', { u: `${window.location.origin}${path}` });
  }, [location.pathname]);
  return null;
}
