-- AlterTable
ALTER TABLE "agendamentos" ALTER COLUMN "medico_id" SET DEFAULT '00000000-0000-4000-8000-000000000001';

-- CreateTable
CREATE TABLE "document_templates" (
    "id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "content" TEXT NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "document_title" VARCHAR(200),
    "organization_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_templates_category_created_at_idx" ON "document_templates"("category", "created_at" ASC);
