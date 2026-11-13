ALTER TABLE "AuthSession" ADD COLUMN "deviceId" TEXT;

CREATE INDEX "AuthSession_deviceId_revokedAt_idx" ON "AuthSession"("deviceId", "revokedAt");

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "Device"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
