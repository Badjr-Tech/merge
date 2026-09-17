ALTER TABLE "public"."Company" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "public"."Company" ADD COLUMN "referredByCode" TEXT;
ALTER TABLE "public"."Company" ADD COLUMN "referralRewardedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Company_referralCode_key" ON "public"."Company"("referralCode");
CREATE TABLE "public"."Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'signed_up',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Referral_referredId_key" ON "public"."Referral"("referredId");
CREATE INDEX "Referral_referrerId_idx" ON "public"."Referral"("referrerId");
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
