import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../merge1.png';

export default function AuthLayout({ title, lead, children, footer, side }) {
  return (
    <div className="auth-page">
      <div className="auth-side">
        <Link to="/"><img src={logo} alt="Merge" style={{ height: 42 }} /></Link>
        <div>
          <h2>{side?.title || 'Grant proposals, written together.'}</h2>
          <p>{side?.text || 'Break an RFP into questions, assign them to your team, track word limits, get approvals, and merge everything into one narrative.'}</p>
          <ul>
            <li><span className="tick">✓</span> Assign questions to teammates and watch progress</li>
            <li><span className="tick">✓</span> Word and character limit checks as you write</li>
            <li><span className="tick">✓</span> Built-in approvals and AI review before you submit</li>
          </ul>
        </div>
        <div className="small" style={{ opacity: .6 }}>© {new Date().getFullYear()} Merge · Powered by Badjr</div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form">
          <Link to="/"><img src={logo} alt="Merge" className="brand" /></Link>
          <h1>{title}</h1>
          {lead && <p className="lead">{lead}</p>}
          {children}
          {footer && <div className="foot">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
