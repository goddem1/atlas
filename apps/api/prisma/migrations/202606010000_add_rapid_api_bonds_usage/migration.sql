-- CreateTable
CREATE TABLE "RapidApiBondsUsage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RapidApiBondsUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RapidApiBondsUsage_provider_monthKey_key" ON "RapidApiBondsUsage"("provider", "monthKey");
