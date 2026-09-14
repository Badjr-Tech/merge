import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui';
import useSeo from '../lib/seo';

export default function Landing() {
  const [track, setTrack] = useState('writer');
  useSeo({ path: '/' });
  return (
    <div>
      <section className="hero">
        <div>
          <h1>Grant proposals, <span>written together.</span></h1>
          <p className="lead">Merge turns a funding application into a shared checklist. Split the RFP into questions, assign each one to a teammate, keep every answer inside its word limit, and merge the whole thing into one polished narrative.</p>
          <div className="cta">
            <Link to="/signup" className="btn btn-primary btn-lg">Start your workspace</Link>
            <a href="#how" className="btn btn-secondary btn-lg">See how it works</a>
          </div>
          <p className="note">Free 14-day trial on every new workspace. No credit card needed.</p>
        </div>
        <div className="hero-art mock">
          <div className="mock-bar"><span /><span /><span /></div>
          <div className="row-between mb-2">
            <strong style={{ color: 'var(--navy)' }}>Youth Arts Expansion Grant</strong>
            <span className="badge badge-gold">Due in 6d</span>
          </div>
          <div className="progress mb-2"><div style={{ width: '62%' }} /></div>
          <div className="mock-row"><span className="avatar avatar-sm">DJ</span><span className="t">Describe your organization's mission</span><span className="badge badge-green">Submitted</span></div>
          <div className="mock-row"><span className="avatar avatar-sm">MR</span><span className="t">Outline the program budget</span><span className="badge badge-periwinkle">In progress</span></div>
          <div className="mock-row"><span className="avatar avatar-sm">AL</span><span className="t">Explain your evaluation plan</span><span className="badge badge-gray">Not started</span></div>
          <div className="mock-row"><span className="avatar avatar-sm">DJ</span><span className="t">Community partnerships</span><span className="badge badge-green">Submitted</span></div>
          <div className="row mt-2" style={{ justifyContent: 'flex-end' }}>
            <span className="btn btn-secondary btn-sm">Request approval</span>
            <span className="btn btn-primary btn-sm">Merge narrative</span>
          </div>
        </div>
      </section>

      <section className="section" id="who">
        <h2>Made for the people who actually write the grants</h2>
        <p className="sub">Whether it's one person on a deadline or a whole team passing sections back and forth.</p>
        <div className="grid-3 who-grid">
          <Card className="who-card"><img src="/img/solo.jpg" alt="A grant writer working alone at a laptop" loading="lazy" /><div className="who-body"><h3>Solo grant writers</h3><p className="small muted mb-0">Keep every question, limit, and past answer in one place instead of a folder of drafts. Ask Merge when you're stuck.</p></div></Card>
          <Card className="who-card"><img src="/img/team.jpg" alt="A nonprofit team gathered around a table reviewing a proposal" loading="lazy" /><div className="who-body"><h3>Nonprofit teams</h3><p className="small muted mb-0">Assign sections to program staff, watch progress fill in, and merge everything into one narrative before the deadline.</p></div></Card>
          <Card className="who-card"><img src="/img/planning.jpg" alt="Consultants mapping out a proposal on a whiteboard" loading="lazy" /><div className="who-body"><h3>Consultants and networks</h3><p className="small muted mb-0">Run several applications at once with a partners directory, an answer bank, and clean handoffs to the people who sign off.</p></div></Card>
        </div>
      </section>

      <section className="section" id="features">
        <h2>Everything a grant team needs in one place</h2>
        <p className="sub">Built for nonprofits, consultants, and small development teams who write proposals as a group.</p>
        <div className="grid-3">
          <Card className="feature"><div className="icon">✎</div><h3>Assign questions, not documents</h3><p>Each RFP question becomes a task with an owner, a status, and a limit. Nobody edits over anyone else.</p></Card>
          <Card className="feature"><div className="icon">☑</div><h3>Compliance built in</h3><p>Word and character counts update as you type, so every answer fits before submission day.</p></Card>
          <Card className="feature"><div className="icon">✓</div><h3>Approvals with a paper trail</h3><p>Send the finished proposal to an approver. Rejections come back with comments and go straight to a correction queue.</p></Card>
          <Card className="feature"><div className="icon">✦</div><h3>AI reviewer</h3><p>Point Merge at the funder's website and purpose statement to get strengths, weaknesses, and a prioritized fix list.</p></Card>
          <Card className="feature"><div className="icon">◷</div><h3>Reuse past proposals</h3><p>Store finished applications as searchable Q&amp;A so your best answers are one click away next time.</p></Card>
          <Card className="feature"><div className="icon">▣</div><h3>File cabinet and calendar</h3><p>Keep 501(c)(3) letters, budgets, and board lists next to the proposals that need them. Track deadlines on a shared calendar.</p></Card>
        </div>
      </section>

      <section className="section" id="how">
        <h2>How it works</h2>
        <p className="sub">From RFP to submitted narrative in four steps.</p>
        <div className="steps">
          <Card className="step"><div className="num">1</div><h4>Create a project</h4><p className="small muted mb-0">Add the grant, its deadline, and the questions the funder asks.</p></Card>
          <Card className="step"><div className="num">2</div><h4>Assign and write</h4><p className="small muted mb-0">Teammates see only their questions, with limits and status.</p></Card>
          <Card className="step"><div className="num">3</div><h4>Review and approve</h4><p className="small muted mb-0">Run the AI reviewer, then route the proposal to an approver.</p></Card>
          <Card className="step"><div className="num">4</div><h4>Merge and submit</h4><p className="small muted mb-0">Merge answers into one narrative and archive it for next time.</p></Card>
        </div>
      </section>

      <section className="photo-band">
        <div className="photo-band-inner">
          <img src="/img/review.jpg" alt="Two colleagues reviewing a printed proposal together" loading="lazy" />
          <div className="photo-band-copy">
            <span className="badge badge-green">Approvals</span>
            <h2>Sign-off without the email chain</h2>
            <p>Send the finished proposal to an approver inside Merge. They read it, approve it, or send it back with notes that land right on the project. Every decision is logged, so nobody wonders which version went out.</p>
            <Link to="/signup" className="btn btn-primary">Try it on your next proposal</Link>
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <h2>Simple pricing</h2>
        <p className="sub">Every new workspace starts with a free 14-day trial of {track === 'writer' ? 'Premium' : 'Small Teams'}, then moves to Free unless you pick a plan. No credit card.</p>
        <div className="pricing-tabs" role="tablist">
          <button role="tab" className={track === 'writer' ? 'active' : ''} onClick={() => setTrack('writer')}>For grant writers</button>
          <button role="tab" className={track === 'team' ? 'active' : ''} onClick={() => setTrack('team')}>For organizations</button>
        </div>
        {track === 'writer' ? (
          <div className="grid-4 pricing-grid">
            <Card className="price-card"><h3>Free</h3><div className="price">$0</div><p className="small muted">Everything a solo writer gets, for one grant.</p><ul><li>1 grant</li><li>Ask Merge and AI reviewer</li><li>Answer bank and send for review</li><li>Download PDF or Word</li></ul><Link to="/signup" className="btn btn-secondary btn-block">Get started</Link></Card>
            <Card className="price-card"><h3>Starter</h3><div className="price">$6.99<small>/mo</small></div><p className="small muted">For a working grant writer.</p><ul><li>Unlimited grants</li><li>Answer bank</li><li>Send for review by link</li><li>File cabinet and calendar</li></ul><Link to="/signup" className="btn btn-secondary btn-block">Start free trial</Link></Card>
            <Card className="price-card featured"><span className="badge badge-green popular">Most popular</span><h3>Premium</h3><div className="price">$21.99<small>/mo</small></div><p className="small muted">Write faster with AI on your side.</p><ul><li>Everything in Starter</li><li>Ask Merge assistant</li><li>AI reviewer</li><li>Partners and past proposals</li><li>Editable document with history</li></ul><Link to="/signup" className="btn btn-primary btn-block">Start free trial</Link></Card>
            <Card className="price-card"><h3>Professional</h3><div className="price">$59.99<small>/mo</small></div><p className="small muted">For consultants with many clients.</p><ul><li>Everything in Premium</li><li>A workspace per client</li><li>Integrations</li><li>Higher AI limits, priority support</li></ul><Link to="/signup" className="btn btn-secondary btn-block">Start free trial</Link></Card>
          </div>
        ) : (
          <div className="grid-4 pricing-grid pricing-5">
            <Card className="price-card"><h3>Free</h3><div className="price">$0</div><p className="small muted">Solo Writer features, one grant.</p><ul><li>1 grant, 1 person</li><li>Ask Merge and AI reviewer</li><li>Answer bank and send for review</li><li>Download PDF or Word</li></ul><Link to="/signup" className="btn btn-secondary btn-block">Get started</Link></Card>
            <Card className="price-card"><h3>Solo Writer</h3><div className="price">$14.99<small>/mo</small></div><p className="small muted">One person writing grants for their organization.</p><ul><li>1 person</li><li>Unlimited grants</li><li>Ask Merge and AI reviewer</li><li>Send for review by link</li><li>Partners and past proposals</li></ul><Link to="/signup" className="btn btn-secondary btn-block">Start free trial</Link></Card>
            <Card className="price-card featured"><span className="badge badge-green popular">Most popular</span><h3>Small Teams</h3><div className="price">$12.99<small>/person/mo</small></div><p className="small muted">Up to 5 people writing together.</p><ul><li>Assign questions, track progress</li><li>Approvals with a paper trail</li><li>Answer bank and Ask Merge</li><li>Partners, past proposals, AI reviewer</li><li>Editable narrative with history</li></ul><Link to="/signup" className="btn btn-primary btn-block">Start free trial</Link></Card>
            <Card className="price-card"><h3>Large Teams</h3><div className="price">$21.99<small>/person/mo</small></div><p className="small muted">Up to 20 people.</p><ul><li>Everything in Small Teams</li><li>Multiple workspaces</li><li>Progress across departments</li></ul><Link to="/signup" className="btn btn-secondary btn-block">Start free trial</Link></Card>
            <Card className="price-card"><h3>Companies</h3><div className="price">$29.99<small>/person/mo</small></div><p className="small muted">Unlimited people.</p><ul><li>Everything in Large Teams</li><li>Integrations: Drive, Zapier, webhooks</li><li>Custom branding</li><li>Priority support</li></ul><Link to="/signup" className="btn btn-secondary btn-block">Start free trial</Link></Card>
          </div>
        )}
      </section>

      <section className="cta-band">
        <h2>Ready to write your next proposal together?</h2>
        <p>Create a workspace, invite your team, and start your first project in minutes.</p>
        <Link to="/signup" className="btn btn-primary btn-lg">Start your workspace</Link>
      </section>
    </div>
  );
}
