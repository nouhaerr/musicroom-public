CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PREMIUM');

ALTER TABLE "User"
ADD COLUMN "subscriptionPlan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE';
