import React, { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import logo from '../merge1.png';
import { useAuth } from '../context/AuthContext';

export default function PublicLayout() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <nav className="site-nav">
        <Link to="/" className="site-logo"><img src={logo} alt="Merge" /></Link>
        <button className="site-menu-btn" onClick={() => setOpen(o => !o)} aria-label="Menu" aria-expanded={open}>{open ? '×' : '☰'}</button>
        <div className={`links ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
          <a href="/#features">Features</a>
          <a href="/#how">How it works</a>
          <a href="/#pricing">Pricing</a>
          {isAuthenticated ? (
            <Link to="/app" className="btn btn-primary">Open Merge</Link>
          ) : (
            <>
              <Link to="/login">Sign in</Link>
              <Link to="/signup" className="btn btn-primary">Start free</Link>
            </>
          )}
        </div>
      </nav>
      <Outlet />
      <footer className="site-footer">
        <div className="footer-links"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/faq">Help</Link><Link to="/contact">Contact</Link><a href="/#pricing">Pricing</a></div>
        © {new Date().getFullYear()} Merge · Merge your workspace. Merge your teamwork. <span className="powered">Powered by <a href="https://badjrtech.com" target="_blank" rel="noopener noreferrer">Badjr</a> · merge@badjrtech.com</span>
      </footer>
      {!isAuthenticated && <Link to="/signup" className="sticky-cta">Start your free trial</Link>}
    </div>
  );
}
