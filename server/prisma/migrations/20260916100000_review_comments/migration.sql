CREATE TABLE "public"."ReviewComment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "questionId" TEXT,
    "reviewerName" TEXT,
    "body" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReviewComment_projectId_createdAt_idx" ON "public"."ReviewComment"("projectId", "createdAt");
ALTER TABLE "public"."ReviewComment" ADD CONSTRAINT "ReviewComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
