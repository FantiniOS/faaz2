-- AlterTable
ALTER TABLE "agendamentos" ALTER COLUMN "medico_id" SET DEFAULT '00000000-0000-4000-8000-000000000001';

-- CreateTable
CREATE TABLE "measurements" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "measured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "body_fat_percentage" DOUBLE PRECISION,
    "waist" DOUBLE PRECISION,
    "abdomen" DOUBLE PRECISION,
    "hips" DOUBLE PRECISION,
    "right_arm" DOUBLE PRECISION,
    "left_arm" DOUBLE PRECISION,
    "right_thigh" DOUBLE PRECISION,
    "left_thigh" DOUBLE PRECISION,
    "notes" VARCHAR(255),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "measurements_patient_id_measured_at_idx" ON "measurements"("patient_id", "measured_at" DESC);

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
