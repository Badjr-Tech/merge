-- Sections from pasted funder question lists, and upload-type questions that are satisfied by a file in the cabinet
ALTER TABLE "Question" ADD COLUMN "section" TEXT;
ALTER TABLE "Question" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "Question" ADD COLUMN "fileId" TEXT;
ALTER TABLE "Question" ADD CONSTRAINT "Question_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Soft-delete for projects
ALTER TABLE "Project" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "removedById" TEXT;
CREATE INDEX "Project_companyId_removedAt_idx" ON "Project"("companyId", "removedAt");
