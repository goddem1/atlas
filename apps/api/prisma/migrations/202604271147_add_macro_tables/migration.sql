-- CreateTable
CREATE TABLE "MacroIndicator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "importance" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MacroIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacroIndicatorTranslation" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "MacroIndicatorTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacroDataPoint" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "actual" DECIMAL(65,30),
    "forecast" DECIMAL(65,30),
    "previous" DECIMAL(65,30),
    "reference" TEXT,
    "isPending" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MacroDataPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MacroIndicatorTranslation_indicatorId_locale_key" ON "MacroIndicatorTranslation"("indicatorId", "locale");

-- CreateIndex
CREATE INDEX "MacroDataPoint_indicatorId_date_idx" ON "MacroDataPoint"("indicatorId", "date");

-- CreateIndex
CREATE INDEX "MacroDataPoint_date_isPending_idx" ON "MacroDataPoint"("date", "isPending");

-- AddForeignKey
ALTER TABLE "MacroIndicatorTranslation" ADD CONSTRAINT "MacroIndicatorTranslation_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "MacroIndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MacroDataPoint" ADD CONSTRAINT "MacroDataPoint_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "MacroIndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

