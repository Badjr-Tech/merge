ALTER TABLE "public"."Company" ADD COLUMN "profile" JSONB;

ALTER TABLE "public"."File" ADD COLUMN "category" TEXT;
ALTER TABLE "public"."File" ADD COLUMN "notes" TEXT;

CREATE TABLE "public"."AssistantMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantMessage_companyId_userId_createdAt_idx" ON "public"."AssistantMessage"("companyId", "userId", "createdAt");
ALTER TABLE "public"."AssistantMessage" ADD CONSTRAINT "AssistantMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."AssistantMessage" ADD CONSTRAINT "AssistantMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."Partner" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "website" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "tags" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Partner_companyId_idx" ON "public"."Partner"("companyId");
ALTER TABLE "public"."Partner" ADD CONSTRAINT "Partner_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
