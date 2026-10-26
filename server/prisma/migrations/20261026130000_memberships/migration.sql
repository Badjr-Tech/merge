-- One row per workspace a person can open, so a consultant can keep each client in its own
-- workspace under one login. User.companyId stays as "the workspace they are looking at now",
-- which is what every existing query scopes by, so nothing else changes meaning.
CREATE TABLE IF NOT EXISTS "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Membership_userId_companyId_key" ON "Membership"("userId", "companyId");
CREATE INDEX IF NOT EXISTS "Membership_userId_idx" ON "Membership"("userId");

ALTER TABLE "Membership" DROP CONSTRAINT IF EXISTS "Membership_userId_fkey";
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" DROP CONSTRAINT IF EXISTS "Membership_companyId_fkey";
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Everyone who already has a workspace becomes a member of it, keeping the role they hold.
INSERT INTO "Membership" ("id", "userId", "companyId", "role", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), u."id", u."companyId", u."role", u."createdAt"
FROM "User" u
WHERE u."companyId" IS NOT NULL
ON CONFLICT ("userId", "companyId") DO NOTHING;
