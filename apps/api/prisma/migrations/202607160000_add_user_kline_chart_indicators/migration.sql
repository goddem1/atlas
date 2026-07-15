-- CreateTable
CREATE TABLE "UserKlineChartIndicators" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "indicators" JSONB NOT NULL DEFAULT '{"main":[],"sub":[]}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserKlineChartIndicators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserKlineChartIndicators_userId_idx" ON "UserKlineChartIndicators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserKlineChartIndicators_userId_pair_key" ON "UserKlineChartIndicators"("userId", "pair");

-- AddForeignKey
ALTER TABLE "UserKlineChartIndicators" ADD CONSTRAINT "UserKlineChartIndicators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
