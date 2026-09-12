export function formatDate(d, opts) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, opts || { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function daysUntil(d) {
  if (!d) return null;
  const ms = new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

export function dueLabel(d) {
  const n = daysUntil(d);
  if (n === null) return null;
  if (n < 0) return { text: `${Math.abs(n)}d overdue`, tone: 'danger' };
  if (n === 0) return { text: 'Due today', tone: 'gold' };
  if (n <= 7) return { text: `Due in ${n}d`, tone: 'gold' };
  return { text: `Due ${formatDate(d, { month: 'short', day: 'numeric' })}`, tone: 'gray' };
}

export const STATUS = {
  draft: { label: 'Draft', tone: 'gray' },
  pending_approval: { label: 'Awaiting approval', tone: 'gold' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Needs changes', tone: 'danger' },
  completed: { label: 'Completed', tone: 'indigo' },
};

export function projectStatus(project) {
  if (project.isCompleted) return STATUS.completed;
  return STATUS[project.status] || STATUS.draft;
}

export const Q_STATUS = {
  pending: { label: 'Not started', tone: 'gray' },
  'in-progress': { label: 'In progress', tone: 'periwinkle' },
  'in-review': { label: 'In review', tone: 'gold' },
  completed: { label: 'Answered', tone: 'indigo' },
  submitted: { label: 'Submitted', tone: 'green' },
};

export function questionStatus(q) { return Q_STATUS[q.status] || Q_STATUS.pending; }

export function displayName(u) {
  if (!u) return 'Unassigned';
  return u.name || u.username || u.email || 'Unknown';
}

export function initials(u) {
  const n = displayName(u);
  return n.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

export function wordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function charCount(text) { return text ? text.length : 0; }

export function limitCheck(answer, maxLimit, limitUnit) {
  const limit = Number(maxLimit) || 0;
  const unit = (limitUnit || '').startsWith('char') ? 'characters' : 'words';
  const count = unit === 'characters' ? charCount(answer) : wordCount(answer);
  return { count, limit, unit, over: limit > 0 && count > limit };
}

export function projectProgress(project) {
  const qs = project.questions || [];
  const total = qs.length;
  const done = qs.filter(q => q.status === 'submitted').length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
