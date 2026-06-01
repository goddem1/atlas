-- CreateTable
CREATE TABLE "BondsPrices" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "interval" TEXT NOT NULL DEFAULT '1d',
    "closeTime" TIMESTAMP(3) NOT NULL,
    "close" DECIMAL(28,12) NOT NULL,

    CONSTRAINT "BondsPrices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BondsPrices_symbol_interval_closeTime_key" ON "BondsPrices"("symbol", "interval", "closeTime");
