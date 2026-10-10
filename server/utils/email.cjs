// Minimal transactional email helper.
// Uses Brevo's HTTP API when BREVO_API_KEY is set; otherwise logs and returns false
// so callers can fall back to showing a copyable link.
const FROM_RAW = process.env.EMAIL_FROM || 'Merge <no-reply@dakjencreative.com>';

function parseFrom(raw) {
  const m = raw.match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/);
  if (m) return { name: (m[1] || 'Merge').trim(), email: m[2].trim() };
  return { name: 'Merge', email: raw.trim() };
}

function emailConfigured() { return Boolean(process.env.BREVO_API_KEY); }

const crypto = require('crypto');

// Signed, single-purpose token so an unsubscribe link works without logging in and cannot be
// reused for anything else. Keyed on the user's email and the list name.
function unsubscribeToken(email, list) {
  const secret = process.env.JWT_SECRET || 'merge-unsubscribe';
  return crypto.createHmac('sha256', secret).update(`${String(email).toLowerCase()}|${list}`).digest('hex').slice(0, 32);
}
function unsubscribeUrl(email, list) {
  return appUrl(`/api/unsubscribe?e=${encodeURIComponent(String(email).toLowerCase())}&l=${encodeURIComponent(list)}&t=${unsubscribeToken(email, list)}`);
}
function unsubscribeFooter(email, list, what) {
  return `<p style="font-size:12px;color:#9a9a9e;margin-top:24px;border-top:1px solid #eeeeee;padding-top:12px">You're getting this because ${what}. <a href="${unsubscribeUrl(email, list)}" style="color:#6b6b6e">Unsubscribe from these emails</a>, or change it in Settings.</p>`;
}

// `unsubscribe` = { email, list }: adds the one-click link headers so mail clients show their own
// unsubscribe button. Transactional mail (resets, invitations, receipts) must NOT pass it.
async function sendEmail({ to, subject, html, text, replyTo, attachments, unsubscribe }) {
  if (!emailConfigured()) {
    console.log(`[email disabled] to=${to} subject="${subject}"`);
    return false;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: parseFrom(FROM_RAW),
        to: String(to).split(',').map(e => ({ email: e.trim() })).filter(x => x.email),
        replyTo: replyTo ? { email: replyTo } : undefined,
        subject,
        htmlContent: html,
        textContent: text,
        attachment: attachments && attachments.length ? attachments : undefined,
        headers: unsubscribe ? {
          'List-Unsubscribe': `<${unsubscribeUrl(unsubscribe.email, unsubscribe.list)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        } : undefined,
      }),
    });
    if (!res.ok) {
      console.error('Brevo error:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email send failed:', err.message);
    return false;
  }
}

function appUrl(path = '') {
  const base = (process.env.APP_URL || 'https://www.mergeworkspace.com').replace(/\/$/, '');
  return `${base}${path}`;
}

// Email layout. Tables and inline styles only — Outlook ignores flexbox, grid and <style> blocks.
// Web fonts do not load in most clients, so the display face falls back to Georgia, which is the
// closest thing to Fraunces that is installed everywhere.
const BRAND = {
  cream: '#fffcf0', white: '#ffffff', border: '#e4e1d6',
  navy: '#0b2d65', green: '#7fab61', greenDark: '#476c2e',
  indigo: '#3e51b5', text: '#3b3b3d', muted: '#6b6b6e', faint: '#9a9a9e',
};
const DISPLAY = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

function layout(title, bodyHtml, options = {}) {
  const site = (process.env.APP_URL || 'https://www.mergeworkspace.com').replace(/\/$/, '');
  const preheader = options.preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${options.preview}</div>` : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${BRAND.cream};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;background:${BRAND.white};border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;">

      <tr><td style="background:${BRAND.cream};padding:20px 32px;border-bottom:3px solid ${BRAND.green};">
        <a href="${site}" style="text-decoration:none;"><img src="${site}/img/merge-logo.png" width="104" height="41" alt="Merge" style="display:block;border:0;outline:none;width:104px;height:41px;"></a>
      </td></tr>

      <tr><td style="padding:30px 32px 8px 32px;">
        <h1 style="margin:0 0 14px 0;font-family:${DISPLAY};font-size:22px;line-height:1.3;font-weight:normal;color:${BRAND.navy};">${title}</h1>
        <div style="font-family:${SANS};font-size:15px;line-height:1.6;color:${BRAND.text};">
          ${bodyHtml}
        </div>
      </td></tr>

      <tr><td style="padding:8px 32px 28px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${BRAND.border};padding-top:16px;font-family:${SANS};font-size:12px;line-height:1.6;color:${BRAND.faint};">
          <a href="${site}" style="color:${BRAND.muted};text-decoration:none;">Merge</a> — merge your workspace, merge your teamwork.<br>
          Not expecting this? You can safely ignore it.<br>
          <span style="color:#c3c0b4;">Powered by <a href="https://badjrtech.com" style="color:#c3c0b4;text-decoration:none;">Badjr</a></span>
        </td></tr></table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

// A real button in every client, including Outlook, via a bordered table cell. `showLink` prints
// the raw URL underneath — worth it for invitations and password resets where a click may fail,
// noise everywhere else.
function button(href, label, options = {}) {
  const link = options.showLink ?? /invite|reset-password|review\//.test(String(href));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr>
  <td align="center" bgcolor="${BRAND.greenDark}" style="border-radius:8px;">
    <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
  </td></tr></table>${link ? `<p style="margin:0 0 4px 0;font-family:${SANS};font-size:12px;color:${BRAND.muted};">Or paste this into your browser:<br><a href="${href}" style="color:${BRAND.indigo};word-break:break-all;">${href}</a></p>` : ''}`;
}

module.exports = { sendEmail, emailConfigured, appUrl, layout, button, unsubscribeToken, unsubscribeUrl, unsubscribeFooter };
