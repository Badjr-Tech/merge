-- Per-feature AI metering: one row per metered action
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiUsage_companyId_feature_createdAt_idx" ON "AiUsage"("companyId", "feature", "createdAt");
CREATE INDEX "AiUsage_projectId_feature_createdAt_idx" ON "AiUsage"("projectId", "feature", "createdAt");
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
