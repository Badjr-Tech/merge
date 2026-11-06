-- Workspace branding: a logo and two colours, used on exported documents.
ALTER TABLE "Company" ADD COLUMN "logoKey" TEXT;
ALTER TABLE "Company" ADD COLUMN "brand" JSONB;
