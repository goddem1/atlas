-- CreateTable
CREATE TABLE "MarketIndexDailyBar" (
    "id" TEXT NOT NULL,
    "indexId" TEXT NOT NULL,
    "interval" TEXT NOT NULL DEFAULT '1d',
    "day" TEXT NOT NULL,
    "openTime" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(28,12),
    "high" DECIMAL(28,12),
    "low" DECIMAL(28,12),
    "close" DECIMAL(28,12) NOT NULL,
    "volume" DECIMAL(38,12),

    CONSTRAINT "MarketIndexDailyBar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketIndexDailyBar_indexId_interval_openTime_key" ON "MarketIndexDailyBar"("indexId", "interval", "openTime");

-- CreateIndex
CREATE INDEX "MarketIndexDailyBar_indexId_openTime_idx" ON "MarketIndexDailyBar"("indexId", "openTime" DESC);
