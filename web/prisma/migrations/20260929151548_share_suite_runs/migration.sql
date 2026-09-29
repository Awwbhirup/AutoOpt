-- AlterTable
ALTER TABLE "ShareLink" ADD COLUMN     "lastViewedAt" TIMESTAMP(3),
ADD COLUMN     "suiteRunId" TEXT,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "runId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ShareLink_suiteRunId_idx" ON "ShareLink"("suiteRunId");

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_suiteRunId_fkey" FOREIGN KEY ("suiteRunId") REFERENCES "SuiteRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A link shares exactly one thing. Every existing row has a runId, so this holds already.
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_one_target" CHECK (("runId" IS NULL) <> ("suiteRunId" IS NULL));
