-- CreateTable
CREATE TABLE "CmcDailySnapshot" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "fearGreedValue" INTEGER NOT NULL,
    "fearGreedClassification" TEXT NOT NULL,
    "btcDominance" DECIMAL(28,12) NOT NULL,
    "ethDominance" DECIMAL(28,12) NOT NULL,
    "totalMarketCap" DECIMAL(28,2) NOT NULL,
    "altcoinMarketCap" DECIMAL(28,2) NOT NULL,
    "btcMarketCap" DECIMAL(28,2) NOT NULL,
    "ethMarketCap" DECIMAL(28,2) NOT NULL,
    "total3MarketCap" DECIMAL(28,2) NOT NULL,
    "altcoinSeasonIndex" INTEGER NOT NULL,
    "altcoinSeasonMarketCap" DECIMAL(28,2),
    "fundingRates" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CmcDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CmcDailySnapshot_day_key" ON "CmcDailySnapshot"("day");

-- CreateIndex
CREATE INDEX "CmcDailySnapshot_day_idx" ON "CmcDailySnapshot"("day" DESC);
