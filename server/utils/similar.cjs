// Matching a question against answers the workspace has already written. Used by the answer
// bank, by the "similar answers" panel while writing, and by the weekly deadline digest to
// point out which open questions have something to reuse.
const prisma = require('./prisma.cjs');

const STOP = new Set(['the','and','for','with','our','your','you','that','this','from','are','was','but','not','have','has','how','what','why','who','when','where','which','will','does','did','please','describe','explain','provide','about','into','their','they','them','these','those','than','then','can','any','all','each','per','its','also','been','being','would','should','could','more','most','such','other','over','under','use','used','using','include','including','list','give','tell','us','we','of','to','in','on','a','an','is','it','as','at','by','or','be','do','if','so','up','no','yes']);

function terms(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))
    .map(w => w.replace(/(ing|ings|ed|es|s|ies|ion|ions|ly)$/, '').replace(/^$/, w));
}

function similarity(a, b) {
  const A = new Set(terms(a)); const B = new Set(terms(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(t => { if (B.has(t)) inter += 1; });
  const jaccard = inter / (A.size + B.size - inter);
  const overlap = inter / Math.min(A.size, B.size);
  return Math.round((0.5 * jaccard + 0.5 * overlap) * 100) / 100;
}

async function answeredQuestions(companyId, excludeQuestionId) {
  const rows = await prisma.question.findMany({
    where: {
      project: { companyId },
      answer: { not: null },
      NOT: excludeQuestionId ? { id: excludeQuestionId } : undefined,
    },
    select: {
      id: true, text: true, answer: true, status: true, updatedAt: true, maxLimit: true, limitUnit: true,
      project: { select: { id: true, name: true, isCompleted: true, status: true, deadlineDate: true, createdAt: true } },
      assignedTo: { select: { id: true, name: true, username: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.filter(r => r.answer && r.answer.trim().length > 20);
}

module.exports = { terms, similarity, answeredQuestions };
