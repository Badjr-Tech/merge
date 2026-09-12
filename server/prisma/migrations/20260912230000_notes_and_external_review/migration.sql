ALTER TABLE "public"."Project" ADD COLUMN "notes" TEXT;
ALTER TABLE "public"."Project" ADD COLUMN "reviewToken" TEXT;
ALTER TABLE "public"."Project" ADD COLUMN "reviewStatus" TEXT;
ALTER TABLE "public"."Project" ADD COLUMN "reviewerName" TEXT;
ALTER TABLE "public"."Project" ADD COLUMN "reviewerEmail" TEXT;
ALTER TABLE "public"."Project" ADD COLUMN "reviewComments" TEXT;
ALTER TABLE "public"."Project" ADD COLUMN "reviewSentAt" TIMESTAMP(3);
ALTER TABLE "public"."Project" ADD COLUMN "reviewRespondedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Project_reviewToken_key" ON "public"."Project"("reviewToken");
