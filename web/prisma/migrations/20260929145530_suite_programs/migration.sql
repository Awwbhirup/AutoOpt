-- AlterTable
ALTER TABLE "BenchmarkSuite" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "SuiteRun" ADD COLUMN     "grid" JSONB,
ADD COLUMN     "startedById" TEXT;

-- CreateTable
CREATE TABLE "SuiteProgram" (
    "suiteId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SuiteProgram_pkey" PRIMARY KEY ("suiteId","programId")
);

-- CreateIndex
CREATE INDEX "SuiteProgram_programId_idx" ON "SuiteProgram"("programId");

-- CreateIndex
CREATE INDEX "SuiteRun_startedById_idx" ON "SuiteRun"("startedById");

-- AddForeignKey
ALTER TABLE "BenchmarkSuite" ADD CONSTRAINT "BenchmarkSuite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiteProgram" ADD CONSTRAINT "SuiteProgram_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "BenchmarkSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiteProgram" ADD CONSTRAINT "SuiteProgram_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiteRun" ADD CONSTRAINT "SuiteRun_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
