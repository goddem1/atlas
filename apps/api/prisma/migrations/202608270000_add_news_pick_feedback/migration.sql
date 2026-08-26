-- CreateTable
CREATE TABLE "NewsPickFeedback" (
    "id" TEXT NOT NULL,
    "postKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "postText" TEXT NOT NULL,
    "postTimestamp" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "llmWeight" INTEGER,
    "llmPolarity" INTEGER,
    "llmType" TEXT,
    "llmCategory" TEXT,
    "llmHeadline" TEXT,
    "humanWeight" INTEGER,
    "humanPolarity" INTEGER,
    "humanType" TEXT,
    "humanCorrect" BOOLEAN,
    "humanNote" TEXT NOT NULL,
    "priceMoveBtc" DOUBLE PRECISION,
    "priceMoveEth" DOUBLE PRECISION,
    "priceMoveWindowHours" INTEGER,
    "embedding" DOUBLE PRECISION[],
    "embeddingModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsPickFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsPickFeedback_postKey_key" ON "NewsPickFeedback"("postKey");

-- CreateIndex
CREATE INDEX "NewsPickFeedback_day_idx" ON "NewsPickFeedback"("day");
