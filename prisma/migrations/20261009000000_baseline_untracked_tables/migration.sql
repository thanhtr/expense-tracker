-- CreateTable
CREATE TABLE "CsvImport" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bank" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "created" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "dateFrom" DATE,
    "dateTo" DATE,

    CONSTRAINT "CsvImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_name_key" ON "HouseholdMember"("name");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_slug_key" ON "HouseholdMember"("slug");

-- CreateTable
CREATE TABLE "IncomeRule" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "merchantPattern" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeRule_merchantPattern_idx" ON "IncomeRule"("merchantPattern");

-- CreateIndex
CREATE INDEX "IncomeRule_category_idx" ON "IncomeRule"("category");

-- CreateTable
CREATE TABLE "RecurringExclusion" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringExclusion_type_value_key" ON "RecurringExclusion"("type", "value");
