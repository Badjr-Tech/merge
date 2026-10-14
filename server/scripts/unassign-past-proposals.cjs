// Past proposals are a record to be recommended from later, not work owed by anyone.
// They were created assigned to whoever added them, which put them in that person's
// task list. New ones are created unassigned; this clears the ones already stored.
//
//   node server/scripts/unassign-past-proposals.cjs          # report only
//   node server/scripts/unassign-past-proposals.cjs --apply  # make the change
//
// Only touches questions in completed projects. Answers, text and project links are
// untouched, so the answer bank and recommendations are unaffected — they key off the
// answer text and workspace, never the assignee.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const where = { assignedToId: { not: null }, project: { isCompleted: true } };

// Say out loud which database this is pointed at. Running it against the local dev copy
// when you meant production is the easy mistake, and it reports a reassuring zero.
function target() {
  try {
    const u = new URL(process.env.DATABASE_URL);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return '(DATABASE_URL not set or unreadable)';
  }
}

(async () => {
  const apply = process.argv.includes('--apply');
  console.log(`Database: ${target()}`);
  const affected = await prisma.question.count({ where });
  const projects = await prisma.project.count({ where: { isCompleted: true, questions: { some: { assignedToId: { not: null } } } } });
  console.log(`${affected} question(s) across ${projects} past proposal(s) are assigned to someone.`);
  if (!affected) { await prisma.$disconnect(); return; }
  if (!apply) {
    console.log('Dry run. Re-run with --apply to clear them.');
    await prisma.$disconnect();
    return;
  }
  const r = await prisma.question.updateMany({ where, data: { assignedToId: null } });
  console.log(`Cleared ${r.count}.`);
  await prisma.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
