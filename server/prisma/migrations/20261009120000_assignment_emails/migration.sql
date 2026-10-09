-- Per-user opt-out for "a question was assigned to you" emails
ALTER TABLE "User" ADD COLUMN "assignmentEmails" BOOLEAN NOT NULL DEFAULT true;
