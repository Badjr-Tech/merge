import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui';

export default function Landing() {
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
          <p className="note">14-day Premium trial on every new workspace. No credit card needed.</p>
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

      <section className="section" id="pricing">
        <h2>Simple pricing</h2>
        <p className="sub">Every new workspace starts with a free 14-day Premium trial. No credit card. Then pick the plan that fits.</p>
        <div className="pricing-5">
          <Card className="price-card"><h3>Free</h3><div className="price">$0</div><p className="small muted">Try it on a real grant.</p><ul><li>1 person</li><li>2 active projects</li><li>Questions and limits</li><li>Merge and download</li></ul><Link to="/signup" className="btn btn-secondary btn-block">Get started</Link></Card>
          <Card className="price-card"><h3>Starter</h3><div className="price">$8.99<small>/mo</small></div><p className="small muted">For a solo grant writer.</p><ul><li>1 person</li><li>Unlimited projects</li><li>Answer bank</li><li>Ask Merge assistant</li></ul><Link to="/signup" className="btn btn-secondary btn-block">Start free trial</Link></Card>
          <Card className="price-card featured"><span className="badge badge-green">Most popular</span><h3 className="mt-1">Premium</h3><div className="price">$22.99<small>/person/mo</small></div><p className="small muted">For teams that write together.</p><ul><li>Up to 5 people</li><li>Approvals</li><li>Partners and past proposals</li><li>Editable narrative with history</li><li>AI reviewer</li></ul><Link to="/signup" className="btn btn-primary btn-block">Start free trial</Link></Card>
          <Card className="price-card"><h3>Enterprise</h3><div className="price">$49.99<small>/person/mo</small></div><p className="small muted">For larger organizations.</p><ul><li>Up to 20 people</li><li>Everything in Premium</li><li>Multiple workspaces</li><li>Priority support</li></ul><Link to="/signup" className="btn btn-secondary btn-block">Start free trial</Link></Card>
          <Card className="price-card"><h3>Custom</h3><div className="price" style={{ fontSize: 26 }}>Let's talk</div><p className="small muted">Consultants, networks, 20+ people.</p><ul><li>Client workspaces</li><li>Custom branding</li><li>Volume pricing</li></ul><a href="mailto:hello@dakjencreative.com" className="btn btn-secondary btn-block">Contact us</a></Card>
        </div>
      </section>

      <section className="cta-band">
        <h2>Ready to write your next proposal together?</h2>
        <p>Create a workspace, invite your team, and start your first project in minutes.</p>
        <Link to="/signup" className="btn btn-primary btn-lg">Start your workspace</Link>
      </section>
    </div>
  );
}
