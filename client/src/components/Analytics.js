import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Vercel Web Analytics via its script tag (no npm dependency). Cookie-free.
// Private app and review URLs are reported as their section only.
export default function Analytics() {
  const location = useLocation();
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || document.getElementById('va')) return;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    window.va('beforeSend', (event) => {
      try {
        const url = new URL(event.url);
        if (url.pathname.startsWith('/app')) url.pathname = '/app';
        else if (url.pathname.startsWith('/review')) url.pathname = '/review';
        else if (url.pathname.startsWith('/invite') || url.pathname.startsWith('/reset-password')) url.pathname = url.pathname.split('/').slice(0, 2).join('/');
        url.search = '';
        return { ...event, url: url.toString() };
      } catch { return event; }
    });
    const s = document.createElement('script');
    s.id = 'va'; s.defer = true; s.src = '/_vercel/insights/script.js';
    document.head.appendChild(s);
  }, []);
  useEffect(() => {
    if (location.pathname === '/app/welcome' && window.va) window.va('event', { name: 'signup_completed' });
  }, [location.pathname]);
  return null;
}
