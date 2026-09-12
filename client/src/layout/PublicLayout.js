import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import logo from '../merge1.png';
import { useAuth } from '../context/AuthContext';

export default function PublicLayout() {
  const { isAuthenticated } = useAuth();
  return (
    <div>
      <nav className="site-nav">
        <Link to="/"><img src={logo} alt="Merge" /></Link>
        <div className="links">
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
      <footer className="site-footer">© {new Date().getFullYear()} Merge · Grant proposals, written together. <span className="powered">Powered by <a href="https://badjr.vercel.app" target="_blank" rel="noopener noreferrer">Badjr</a></span></footer>
    </div>
  );
}
