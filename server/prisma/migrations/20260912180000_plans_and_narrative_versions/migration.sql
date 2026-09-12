ALTER TABLE "public"."Company" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'starter';

CREATE TABLE "public"."NarrativeVersion" (
    "id" TEXT NOT NULL,
    "narrativeId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NarrativeVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NarrativeVersion_narrativeId_versionNumber_key" ON "public"."NarrativeVersion"("narrativeId", "versionNumber");
ALTER TABLE "public"."NarrativeVersion" ADD CONSTRAINT "NarrativeVersion_narrativeId_fkey" FOREIGN KEY ("narrativeId") REFERENCES "public"."Narrative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
