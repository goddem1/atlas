-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entryPrice" DECIMAL(24,8) NOT NULL,
    "exitPrice" DECIMAL(24,8) NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "entryAt" TIMESTAMP(3) NOT NULL,
    "exitAt" TIMESTAMP(3) NOT NULL,
    "commission" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "fundingFee" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "comment" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_userId_exitAt_idx" ON "Trade"("userId", "exitAt");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
