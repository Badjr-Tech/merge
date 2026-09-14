import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { setShow(!localStorage.getItem('cookieNoticeSeen')); } catch { setShow(true); } }, []);
  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem('cookieNoticeSeen', '1'); } catch { /* ignore */ } setShow(false); };
  return (
    <div className="cookie-notice" role="dialog" aria-label="Privacy notice">
      <span>Merge uses browser storage to keep you signed in and Vercel Analytics, which is cookie-free, to see which pages are used. No ad tracking. <Link to="/privacy">Privacy policy</Link></span>
      <button className="btn btn-primary btn-sm" onClick={dismiss}>Got it</button>
    </div>
  );
}
