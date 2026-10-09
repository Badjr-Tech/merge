-- Pilot status: free access for a set period that then reverts to a named plan
ALTER TABLE "Company" ADD COLUMN "pilotEndsAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "pilotPlan" TEXT;
ALTER TABLE "Company" ADD COLUMN "pilotRevertsTo" TEXT;
ALTER TABLE "Company" ADD COLUMN "pilotWarnedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "pilotEndedAt" TIMESTAMP(3);

-- Carry existing comps over as pilots that revert to Free
UPDATE "Company"
   SET "pilotEndsAt" = "compedUntil",
       "pilotPlan" = "plan",
       "pilotRevertsTo" = 'free'
 WHERE "compedUntil" IS NOT NULL AND "compedUntil" > NOW();
