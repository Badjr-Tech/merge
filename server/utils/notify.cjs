// One call, two channels. Everything that matters to a person should reach them in the app AND by
// email, so nobody misses work because they had a tab closed.
//
//   notify({ user, type, title, body, link, email: { subject, html, text }, list })
//
// `list` names the unsubscribe list and the preference field; leave it out for mail nobody should
// be able to turn off (approval decisions, password resets). The in-app notification is always
// written — opting out of email never hides work from you inside Merge.
const prisma = require('./prisma.cjs');
const { sendEmail, layout, button, appUrl, unsubscribeFooter } = require('./email.cjs');

const LISTS = {
  assignments: 'assignmentEmails',
  deadlines: 'deadlineEmails',
};

function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function notify({ user, companyId, type, title, body, link, email, list, replyTo }) {
  if (!user || !user.id) return;
  try {
    await prisma.notification.create({
      data: { userId: user.id, companyId: companyId || user.companyId || null, type, title, body: body || null, link: link || null },
    });
  } catch (err) { console.error('Notification write failed:', err.message); }

  if (!email) return;
  const field = list ? LISTS[list] : null;
  if (field && user[field] === false) return;             // opted out of this kind of email
  try {
    await sendEmail({
      to: user.email,
      replyTo,
      subject: email.subject,
      html: email.html + (list ? unsubscribeFooter(user.email, list, email.because || 'you are on this grant') : ''),
      text: email.text,
      ...(list ? { unsubscribe: { email: user.email, list } } : {}),
    });
  } catch (err) { console.error('Notify email failed:', err.message); }
}

// Same thing for several people at once.
async function notifyAll(users, build) {
  await Promise.all((users || []).filter(Boolean).map(u => notify({ user: u, ...build(u) })));
}

module.exports = { notify, notifyAll, esc, layout, button, appUrl };
