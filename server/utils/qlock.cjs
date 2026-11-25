// An advisory lock on one question, so two people cannot write over each other's answer.
//
// It is deliberately not a permission. It expires on its own, because the common case is not
// malice but a browser tab left open on a question: without an expiry that tab would hold the
// question for everyone else until someone went looking for it. The editor renews the lock
// while it is actually open, so a live writer keeps it and an abandoned tab loses it.
const QUESTION_LOCK_MS = 90 * 1000;

// Who holds this question right now, or null. Returns null for an expired lock rather than
// reporting a holder nobody can see, so callers never have to check the clock themselves.
function holderOf(question) {
  if (!question || !question.lockedById || !question.lockedAt) return null;
  const age = Date.now() - new Date(question.lockedAt).getTime();
  if (age > QUESTION_LOCK_MS) return null;
  return { id: question.lockedById, lockedAt: question.lockedAt, user: question.lockedBy || null };
}

// Somebody other than this user is in the question.
function heldByOther(question, userId) {
  const h = holderOf(question);
  return h && h.id !== userId ? h : null;
}

// Claiming and releasing go through raw SQL on purpose. Question.updatedAt is @updatedAt, and
// conflict detection compares the updatedAt the writer loaded against the current one. If a
// renewal bumped updatedAt, every heartbeat would look like someone else's edit and the
// "refresh to see the latest" prompt would fire constantly on a question nobody had touched.
async function claim(prisma, questionId, userId) {
  // The time is written as an explicit UTC wall clock. lockedAt is a TIMESTAMP with no zone and
  // Prisma reads it back as UTC, but a bare NOW() -- or a JS Date handed to raw SQL -- lands in
  // the database session's local time. On a machine set to anything but UTC that stored a value
  // hours in the past, so every lock was born already expired and locked nobody out. Measured
  // on this one: 15:35 written for a 20:35 claim.
  const nowUtc = new Date().toISOString();
  await prisma.$executeRaw`UPDATE "Question" SET "lockedById" = ${userId}, "lockedAt" = ${nowUtc}::timestamp WHERE "id" = ${questionId}`;
}

async function release(prisma, questionId, userId) {
  // Scoped to the holder so a late release from an old tab cannot unlock the person who has it now.
  await prisma.$executeRaw`UPDATE "Question" SET "lockedById" = NULL, "lockedAt" = NULL WHERE "id" = ${questionId} AND "lockedById" = ${userId}`;
}

// What the client needs to show a lock: who, and when it lapses if they stop renewing.
function lockPayload(holder) {
  if (!holder) return null;
  return {
    userId: holder.id,
    name: (holder.user && (holder.user.name || holder.user.username)) || 'Someone on your team',
    since: holder.lockedAt,
    expiresAt: new Date(new Date(holder.lockedAt).getTime() + QUESTION_LOCK_MS).toISOString(),
  };
}

module.exports = { QUESTION_LOCK_MS, holderOf, heldByOther, claim, release, lockPayload };
