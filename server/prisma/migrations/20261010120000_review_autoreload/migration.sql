-- Auto-reload for extra AI reviewer runs, off by default
ALTER TABLE "Company" ADD COLUMN "reviewAutoReload" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN "reviewReloadQty" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Company" ADD COLUMN "reviewReloadCap" INTEGER NOT NULL DEFAULT 4;
