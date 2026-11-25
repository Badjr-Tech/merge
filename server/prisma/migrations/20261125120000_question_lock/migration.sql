-- Advisory, expiring lock so two people do not write over each other in one question.
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "lockedById" TEXT;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "Question" ADD CONSTRAINT "Question_lockedById_fkey"
    FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
