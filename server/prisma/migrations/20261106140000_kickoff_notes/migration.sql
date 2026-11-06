-- Kickoff notes: what each person on a grant thinks it should argue, captured at the start.
CREATE TABLE "KickoffNote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KickoffNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KickoffNote_projectId_createdAt_idx" ON "KickoffNote"("projectId", "createdAt");

ALTER TABLE "KickoffNote" ADD CONSTRAINT "KickoffNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KickoffNote" ADD CONSTRAINT "KickoffNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
