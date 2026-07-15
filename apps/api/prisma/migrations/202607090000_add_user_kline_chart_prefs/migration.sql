-- CreateTable
CREATE TABLE "UserKlineChartPrefs" (
    "userId" TEXT NOT NULL,
    "drawingToolPins" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserKlineChartPrefs_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserKlineChartPrefs" ADD CONSTRAINT "UserKlineChartPrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
