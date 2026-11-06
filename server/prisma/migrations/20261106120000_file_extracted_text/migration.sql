-- Text pulled out of an uploaded document so the assistant can read it without
-- fetching the file from Blob storage on every draft.
ALTER TABLE "File" ADD COLUMN "extractedText" TEXT;
