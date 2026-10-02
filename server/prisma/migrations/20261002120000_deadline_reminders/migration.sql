-- Deadline reminder emails: per-user opt-out, and the last milestone emailed per project
ALTER TABLE "User" ADD COLUMN "deadlineEmails" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Project" ADD COLUMN "deadlineReminderDay" INTEGER;
