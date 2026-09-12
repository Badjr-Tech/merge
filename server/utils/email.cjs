// Minimal transactional email helper.
// Uses Resend's HTTP API when RESEND_API_KEY is set; otherwise logs and returns false
// so callers can fall back to showing a copyable link.
const FROM = process.env.EMAIL_FROM || 'Merge <onboarding@resend.dev>';

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email disabled] to=${to} subject="${subject}"`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to, subject, html, text }),
    });
    if (!res.ok) {
      console.error('Resend error:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email send failed:', err.message);
    return false;
  }
}

function appUrl(path = '') {
  const base = (process.env.APP_URL || 'https://mergev1-78hi.vercel.app').replace(/\/$/, '');
  return `${base}${path}`;
}

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#fffcf0;font-family:Helvetica,Arial,sans-serif;color:#3b3b3d">
  <div style="max-width:520px;margin:32px auto;background:#ffffff;border:1px solid #eeeeee;border-radius:12px;padding:32px">
    <div style="font-size:28px;font-weight:700;color:#7fab61;margin-bottom:16px">merge</div>
    <h1 style="font-size:20px;color:#0b2d65;margin:0 0 12px">${title}</h1>
    ${bodyHtml}
    <p style="font-size:12px;color:#888;margin-top:32px">If you weren't expecting this email you can ignore it.</p>
  </div></body></html>`;
}

function button(href, label) {
  return `<p style="margin:24px 0"><a href="${href}" style="background:#7fab61;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${label}</a></p>
  <p style="font-size:13px;color:#666">Or copy this link: <br><a href="${href}" style="color:#3e51b5">${href}</a></p>`;
}

module.exports = { sendEmail, appUrl, layout, button };
