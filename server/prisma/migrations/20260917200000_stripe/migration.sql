ALTER TABLE "public"."Company" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "public"."Company" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "public"."Company" ADD COLUMN "subscriptionStatus" TEXT;
ALTER TABLE "public"."Company" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "public"."Company" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Company_stripeCustomerId_key" ON "public"."Company"("stripeCustomerId");
CREATE UNIQUE INDEX "Company_stripeSubscriptionId_key" ON "public"."Company"("stripeSubscriptionId");
