-- CreateTable
CREATE TABLE "FearGreedDailyBar" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "classification" TEXT NOT NULL,
    "barTime" TIMESTAMP(3) NOT NULL,
    "btcPrice" DECIMAL(28,12),
    "btcVolume" DECIMAL(38,12),

    CONSTRAINT "FearGreedDailyBar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FearGreedDailyBar_day_key" ON "FearGreedDailyBar"("day");

-- CreateIndex
CREATE INDEX "FearGreedDailyBar_barTime_idx" ON "FearGreedDailyBar"("barTime" DESC);
