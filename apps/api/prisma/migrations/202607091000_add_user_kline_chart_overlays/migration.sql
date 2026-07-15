-- CreateTable
CREATE TABLE "UserKlineChartOverlays" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "overlays" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserKlineChartOverlays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserKlineChartOverlays_userId_idx" ON "UserKlineChartOverlays"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserKlineChartOverlays_userId_pair_key" ON "UserKlineChartOverlays"("userId", "pair");

-- AddForeignKey
ALTER TABLE "UserKlineChartOverlays" ADD CONSTRAINT "UserKlineChartOverlays_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
