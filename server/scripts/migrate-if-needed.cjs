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
  execSync('node node_modules/.bin/prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, PRISMA_CLIENT_ENGINE_TYPE: 'binary', PRISMA_MIGRATE_TIMEOUT: '600000' } });
}

main().catch(err => { console.error(err); process.exit(1); });
