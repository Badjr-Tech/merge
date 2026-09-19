CREATE TABLE "public"."FeedbackTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userEmail" TEXT NOT NULL,
    "userName" TEXT,
    "workspace" TEXT,
    "plan" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "page" TEXT,
    "rating" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FeedbackTicket_status_createdAt_idx" ON "public"."FeedbackTicket"("status", "createdAt");
