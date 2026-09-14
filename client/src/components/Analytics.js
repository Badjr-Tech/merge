import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { inject, track } from '@vercel/analytics';

// Vercel Web Analytics. Cookie-free. Private app and review URLs are reported as their section only.
export default function Analytics() {
  const location = useLocation();
  useEffect(() => {
    inject({
      mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      beforeSend: (event) => {
        try {
          const url = new URL(event.url);
          if (url.pathname.startsWith('/app')) url.pathname = '/app';
          else if (url.pathname.startsWith('/review')) url.pathname = '/review';
          else if (url.pathname.startsWith('/invite') || url.pathname.startsWith('/reset-password')) url.pathname = url.pathname.split('/').slice(0, 2).join('/');
          url.search = '';
          return { ...event, url: url.toString() };
        } catch { return event; }
      },
    });
  }, []);
  useEffect(() => {
    if (location.pathname === '/app/welcome') track('signup_completed');
  }, [location.pathname]);
  return null;
}
