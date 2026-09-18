import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// Vercel Web Analytics via its script tag (no npm dependency). Cookie-free.
// We disable auto-tracking and send each page view ourselves so private app and review URLs are masked.
function masked(pathname) {
  if (pathname.startsWith('/app')) return '/app';
  if (pathname.startsWith('/review')) return '/review';
  if (pathname.startsWith('/invite') || pathname.startsWith('/reset-password')) return pathname.split('/').slice(0, 2).join('/');
  return pathname;
}

export default function Analytics() {
  const location = useLocation();
  const loaded = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || loaded.current) return;
    loaded.current = true;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    const s = document.createElement('script');
    s.id = 'va'; s.defer = true;
    s.src = '/_vercel/insights/script.js';
    s.setAttribute('data-disable-auto-track', '1');
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    window.va('pageview', { route: masked(location.pathname), path: masked(location.pathname) });
    if (location.pathname === '/app/welcome') window.va('event', { name: 'signup_completed' });
  }, [location.pathname]);

  return null;
}
