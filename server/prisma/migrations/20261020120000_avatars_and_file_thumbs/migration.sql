-- Profile pictures and file-cabinet hover thumbnails.
-- Both hold a Vercel Blob pathname, not the image bytes. Additive and nullable: existing
-- rows read as "no picture" / "no thumbnail" and fall back to initials or a filetype glyph.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarKey" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUpdatedAt" TIMESTAMP(3);
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "thumbKey" TEXT;

-- File contents move to Vercel Blob. "data" becomes nullable so new rows can leave it empty;
-- files uploaded before this keep their bytes in Postgres and are still served from there.
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "blobKey" TEXT;
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "size" INTEGER;
ALTER TABLE "File" ALTER COLUMN "data" DROP NOT NULL;
