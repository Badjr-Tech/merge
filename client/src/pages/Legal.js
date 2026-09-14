import React from 'react';
import { Link } from 'react-router-dom';
import useSeo from '../lib/seo';

const UPDATED = 'September 14, 2026';
const COMPANY = 'Badjr';
const CONTACT = 'hello@dakjencreative.com';

export function Privacy() {
  useSeo({ title: 'Privacy policy', description: 'How Merge collects, uses, and protects your data.', path: '/privacy' });
  return (
    <article className="legal">
      <h1>Privacy policy</h1>
      <p className="muted">Last updated {UPDATED}</p>
      <p>Merge is operated by {COMPANY} ("we", "us"). This policy explains what we collect when you use Merge, why, and the choices you have.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address, and password (stored as a one-way hash), plus the workspace name and plan.</li>
        <li><strong>Content you add:</strong> projects, questions, answers, notes, organization profile, partners, files you upload, and messages you send to the writing assistant.</li>
        <li><strong>Usage data:</strong> pages visited and features used, collected through Vercel Web Analytics, which does not use cookies or track you across sites.</li>
        <li><strong>Technical data:</strong> IP address, browser type, and timestamps in server logs, kept for security and troubleshooting.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To run the service: sign you in, store your work, send invitations, review links, and trial emails.</li>
        <li>To power AI features: when you use Ask Merge, the AI reviewer, or website import, the relevant text (your organization profile, the open project, and your message) is sent to Google's Gemini API to generate a response. Google processes it under its API terms and does not use it to train models.</li>
        <li>To improve Merge, using aggregated usage data.</li>
      </ul>
      <p>We do not sell your data, and we do not show ads.</p>
      <h2>Who can see your content</h2>
      <p>People in your workspace can see the projects, answers, files, and notes in that workspace according to their role. A review link shows one proposal, read-only, to whoever holds the link. Our staff access customer content only to fix a problem you have reported or as required by law.</p>
      <h2>Service providers</h2>
      <p>Merge runs on Vercel (hosting), Neon (database), Google Gemini (AI), and Brevo (email). Each processes data only to provide its service to us.</p>
      <h2>Retention and deletion</h2>
      <p>Your content stays as long as your workspace exists. To delete your workspace and its data, email {CONTACT} from the admin's address and we will remove it within 30 days. Backups are purged on a rolling basis after that.</p>
      <h2>Your rights</h2>
      <p>You can export your work at any time (PDF and Word downloads), correct your profile in Settings, and request a copy or deletion of your data by email. If you are in the EU, UK, or California, you have additional rights under GDPR and CCPA, and we will honor them.</p>
      <h2>Cookies</h2>
      <p>Merge uses one piece of browser storage to keep you signed in and a few to remember preferences such as the notes drawer width. We do not use advertising or cross-site tracking cookies. Vercel Analytics does not set cookies.</p>
      <h2>Children</h2>
      <p>Merge is for organizations and professionals and is not directed at children under 16.</p>
      <h2>Changes</h2>
      <p>If we make material changes, we will email workspace admins and update the date at the top of this page.</p>
      <h2>Contact</h2>
      <p>{COMPANY}<br />Email: <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
      <p><Link to="/terms">Terms of service</Link></p>
    </article>
  );
}

export function Terms() {
  useSeo({ title: 'Terms of service', description: 'The terms that govern use of Merge.', path: '/terms' });
  return (
    <article className="legal">
      <h1>Terms of service</h1>
      <p className="muted">Last updated {UPDATED}</p>
      <p>These terms are an agreement between you and {COMPANY} for use of Merge. By creating a workspace you agree to them.</p>
      <h2>Your account</h2>
      <p>You must provide accurate information and keep your password private. The workspace admin is responsible for who they invite and for the content their workspace holds.</p>
      <h2>Your content</h2>
      <p>You own everything you write and upload. You give us permission to store, display, and process it only to provide the service, including sending relevant text to our AI provider when you use AI features. You are responsible for having the right to upload what you upload.</p>
      <h2>AI features</h2>
      <p>Ask Merge and the AI reviewer generate suggestions. They can be wrong. Review everything before it goes into a proposal, and do not treat AI output as legal, financial, or compliance advice.</p>
      <h2>Plans, trials, and billing</h2>
      <p>New workspaces get a free 14-day trial and then move to the Free plan unless a paid plan is chosen. Paid plans are billed monthly per workspace or per person as shown on the pricing page. You can change or cancel a plan at any time from Settings; changes take effect at the next billing date. We may change prices with 30 days' notice by email.</p>
      <h2>Acceptable use</h2>
      <p>Do not use Merge to store or send unlawful content, to attack the service, to scrape other users' data, or to resell access without a Companies or Custom agreement.</p>
      <h2>Availability</h2>
      <p>We work to keep Merge available but do not guarantee uninterrupted service. Export your proposals before deadlines.</p>
      <h2>Termination</h2>
      <p>You can delete your workspace at any time by contacting us. We may suspend workspaces that violate these terms, with notice where practical.</p>
      <h2>Disclaimer and liability</h2>
      <p>Merge is provided as is. To the extent allowed by law, {COMPANY} is not liable for indirect or consequential damages, and our total liability is limited to the amount you paid us in the 12 months before the claim.</p>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of the State of New York, United States.</p>
      <h2>Contact</h2>
      <p>{COMPANY}<br />Email: <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
      <p><Link to="/privacy">Privacy policy</Link></p>
    </article>
  );
}

export function NotFoundPublic() {
  useSeo({ title: 'Page not found', noindex: true });
  return (
    <div className="legal" style={{ textAlign: 'center', padding: '80px 20px' }}>
      <div style={{ fontSize: 64, fontFamily: 'var(--font-display)', color: 'var(--green)', lineHeight: 1 }}>404</div>
      <h1>That page doesn't exist</h1>
      <p className="muted">The link may be old, or the address has a typo.</p>
      <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
        <Link to="/" className="btn btn-primary">Back to home</Link>
        <Link to="/login" className="btn btn-secondary">Sign in</Link>
      </div>
    </div>
  );
}

export function Welcome() {
  useSeo({ title: 'Welcome to Merge', noindex: true });
  return (
    <div className="legal" style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div className="badge badge-green mb-2">Workspace created</div>
      <h1>You're in. Here's how to get the most out of your trial.</h1>
      <ol className="welcome-steps">
        <li><strong>Create your first project.</strong> Paste the funder's questions and set their limits.</li>
        <li><strong>Fill in your organization profile.</strong> Ask Merge writes in your voice once it knows your mission, programs, and impact.</li>
        <li><strong>Add a past proposal.</strong> The answer bank starts suggesting reusable answers right away.</li>
      </ol>
      <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
        <Link to="/app/projects/new" className="btn btn-primary btn-lg">Create a project</Link>
        <Link to="/app/settings" className="btn btn-secondary btn-lg">Set up profile</Link>
      </div>
      <p className="tiny muted mt-3">We sent a welcome email with these steps. You can find this checklist any time on your Home page.</p>
    </div>
  );
}
