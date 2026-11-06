// Runs `prisma migrate deploy` only when there are migrations the database hasn't applied.
// A no-op deploy (docs change, empty commit) then never has to take Prisma's advisory lock,
// which has failed builds when a stale connection was still holding it.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const dir = path.join(__dirname, '..', 'prisma', 'migrations');
  const local = fs.readdirSync(dir).filter(n => fs.statSync(path.join(dir, n)).isDirectory()).sort();
  const prisma = new PrismaClient();
  let applied = [];
  try {
    const rows = await prisma.$queryRawUnsafe('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL');
    applied = rows.map(x => x.migration_name);
  } catch (e) {
    console.log('No _prisma_migrations table yet; running migrate deploy.');
  } finally {
    await prisma.$disconnect();
  }
  const pending = local.filter(n => !applied.includes(n));
  if (applied.length && pending.length === 0) {
    console.log(`Database is up to date (${applied.length} migrations). Skipping migrate deploy.`);
    return;
  }
  console.log(`Pending migrations: ${pending.join(', ') || '(initial)'}`);
  deployWithRetry();
}

// P1002 is "reached the database but it timed out": a suspended Neon instance waking up, or
// another connection still holding the advisory lock. It has failed a deploy that then
// succeeded unchanged, so it is worth waiting out rather than leaving the build red and the
// release stuck behind it. Anything else — a migration that genuinely will not apply — is
// raised on the first attempt, because retrying it would only hide the reason.
function deployWithRetry(attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const WAIT_SECONDS = 15;
  try {
    execSync('node node_modules/.bin/prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, PRISMA_CLIENT_ENGINE_TYPE: 'binary', PRISMA_MIGRATE_TIMEOUT: '600000' } });
  } catch (err) {
    const timedOut = String(err.stdout || '').includes('P1002') || String(err.stderr || '').includes('P1002') || String(err.message || '').includes('P1002');
    if (!timedOut || attempt >= MAX_ATTEMPTS) throw err;
    console.log(`migrate deploy timed out reaching the database (P1002). Attempt ${attempt} of ${MAX_ATTEMPTS}; waiting ${WAIT_SECONDS}s.`);
    execSync(`sleep ${WAIT_SECONDS}`);
    deployWithRetry(attempt + 1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
