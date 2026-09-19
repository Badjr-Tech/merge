import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useSeo from '../lib/seo';

export const FAQS = [
  { q: 'What is Merge?', a: 'Merge is a shared workspace for writing grant proposals. You enter the questions a funder asks, write or assign the answers, keep each one inside its limit, get sign-off, and download the finished proposal as PDF or Word.' },
  { q: 'Is there a free plan?', a: 'Yes. Free includes one grant with the answer bank, send-for-review links, partners, past proposals, notes, and downloads. AI features start on paid plans. Every new workspace also gets a 14-day trial of a paid plan first.' },
  { q: "What's the difference between a grant writer workspace and an organization workspace?", a: 'A grant writer workspace is for one person: no assigning, no statuses, just write, send for review, and download. An organization workspace supports a team: assign questions to people, track progress, formal approvals, and shared libraries. You can switch types in Settings.' },
  { q: 'How does "Send for review" work?', a: 'From any project, click Send for review, enter the reviewer\'s name and email, and Merge emails them a link. They read the proposal with no account, leave notes on any section, and approve it or request changes. You get an email with their decision and their notes appear inside the project.' },
  { q: 'Do reviewers need a seat?', a: 'No. Reviewers use a link and never count against your plan. Seats are only for people who write inside the workspace.' },
  { q: 'What does Ask Merge know about my organization?', a: 'It reads your organization profile from Settings (mission, philosophy, programs, audience, impact, tone), your partners directory, and the project you have open, including each question, its limit, and your current draft. Fill in the profile and its advice gets specific. It never invents statistics; it writes placeholders instead.' },
  { q: 'Is my data used to train AI?', a: 'No. AI requests go to Google\'s Gemini API under terms that do not use your content for training. Your proposals are never shared with other workspaces.' },
  { q: 'How do word and character limits work?', a: 'Set a limit on each question. Counts update while you type and the Compliance page shows every answer against its limit, flagging any that are over.' },
  { q: 'Can I reuse answers from past grants?', a: 'Yes. Every answer you save goes into the answer bank. When you open a similar question in a new grant, Merge shows past answers with a match score and a "Use this answer" button. You can also add proposals you wrote before Merge under Past proposals.' },
  { q: 'What file types can I upload to the file cabinet?', a: 'Any file up to 4 MB: PDFs, Word docs, spreadsheets, images. Tag each one with a category like past grant application or budget so you can find it later.' },
  { q: 'How do I invite teammates?', a: 'On an organization plan, go to Team, click Invite teammate, enter their email and role. They get a link that creates their account inside your workspace. Roles are admin, editor, approver, and viewer.' },
  { q: 'How do I cancel?', a: 'Settings, then Cancel plan, then confirm. Two clicks, no call. You keep access until the end of the period you paid for, then move to Free. Nothing is deleted, and you can come back any time.' },
  { q: 'What happens when my trial ends?', a: 'Your workspace moves to the Free plan automatically. Everything you wrote stays. We email you three days before and on the day it ends. Pick a paid plan any time from Settings.' },
  { q: 'Can I get a refund?', a: 'If something went wrong, email merge@badjrtech.com within 14 days of a charge and we will sort it out.' },
  { q: 'I forgot my password.', a: 'Use "Forgot password" on the sign-in page. The link goes to the email you signed up with. If you are not sure which email that was, your workspace admin can generate a reset link from the Team page, or contact us.' },
  { q: 'Ask Merge says it "could not answer."', a: 'Usually a temporary issue with the AI service. Wait a minute and try again. If it keeps happening, submit a ticket from Support and include what you asked.' },
  { q: 'I sent a review link and my reviewer never got the email.', a: 'Ask them to check spam. You can also copy the review link from the project page and send it yourself; it works the same way.' },
  { q: 'Can I export the finished proposal?', a: 'Yes. Merge the answers on the Document tab, then download as PDF or Word. On paid plans you can also edit the merged document as one piece, with version history.' },
  { q: 'Where do I report a bug or ask for help?', a: 'Signed in: use the Feedback tab on the right edge of any page, or the Support page for a full ticket you can track. Signed out: the Contact page. We reply by email within one business day.' },
];

export default function FAQ() {
  useSeo({ title: 'Help & FAQ', description: 'Answers to common questions about Merge: plans, reviews, AI, teams, exports, billing, and troubleshooting.', path: '/faq' });
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const list = FAQS.filter(f => !q || (f.q + ' ' + f.a).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="legal" style={{ maxWidth: 780 }}>
      <h1>Help &amp; FAQ</h1>
      <p className="muted">Quick answers to the questions we get most. Can't find it? <Link to="/contact">Contact us</Link>.</p>
      <input className="input mb-3" placeholder="Search questions…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="faq">
        {list.map((f, i) => (
          <div key={f.q} className={`faq-item ${open === i ? 'open' : ''}`}>
            <button type="button" className="faq-q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>{f.q}<span>{open === i ? '−' : '+'}</span></button>
            {open === i && <div className="faq-a">{f.a}</div>}
          </div>
        ))}
        {list.length === 0 && <p className="muted">No matches. <Link to="/contact">Ask us directly</Link>.</p>}
      </div>
    </div>
  );
}
