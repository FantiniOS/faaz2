-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_INVITE', 'ACTIVE', 'REVOKED', 'LOCKED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('CLINICAL_ACCESS', 'MEDICAL_RECORD', 'SECURITY_AND_AUTH', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BiologicalSex" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateEnum
CREATE TYPE "CarePlanStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUSPENDED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Cargo" AS ENUM ('DONO_CLINICA', 'MEDICO', 'SECRETARIA', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "CheckinOrigin" AS ENUM ('PATIENT_ANDROID_APP', 'CLINICAL_WEB_PANEL');

-- CreateEnum
CREATE TYPE "ConsultationEventType" AS ENUM ('ROUTINE_CONSULTATION', 'NUTRITION_EVALUATION', 'LAB_REVIEW', 'CLINICAL_ADDENDUM');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('DRAFT', 'FINALIZED', 'SUPERSEDED', 'ANNULLED_WITH_JUSTIFICATION');

-- CreateEnum
CREATE TYPE "DietPlanStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "FoodMacroTag" AS ENUM ('PROTEIN', 'CARB', 'FIBER_MICRO', 'HEALTHY_FAT');

-- CreateEnum
CREATE TYPE "GoalCategory" AS ENUM ('HYDRATION', 'CALORIE_BURN', 'SYMPTOM_DIARY', 'STEPS', 'FASTING_WINDOW', 'CAPILLARY_GLUCOSE');

-- CreateEnum
CREATE TYPE "GoalFrequency" AS ENUM ('DAILY', 'WEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'REPLACED');

-- CreateEnum
CREATE TYPE "MealPeriodIcon" AS ENUM ('morning', 'noon', 'afternoon', 'night');

-- CreateEnum
CREATE TYPE "MeasurementSourceType" AS ENUM ('CLINICAL_BIOIMPEDANCE', 'CLINICAL_SCALE', 'PATIENT_APP_SELF_REPORT');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'CLINIC_ADMIN', 'ADMIN', 'DOCTOR', 'NUTRITIONIST', 'RECEPTIONIST', 'STAFF', 'PATIENT');

-- CreateTable
CREATE TABLE "agendamentos" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "data_hora" TIMESTAMPTZ(6) NOT NULL,
    "tipo" VARCHAR(40) NOT NULL DEFAULT 'RETORNO',
    "status" VARCHAR(30) NOT NULL DEFAULT 'AGENDADO',
    "observacao" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "duracao_minutos" INTEGER NOT NULL DEFAULT 30,
    "encaixe" BOOLEAN NOT NULL DEFAULT false,
    "medico_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
    "especialidade" VARCHAR(40) NOT NULL DEFAULT 'ENDOCRINOLOGIA',

    CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alimentos" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(255) NOT NULL,
    "porcao_base" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "calorias" DOUBLE PRECISION NOT NULL,
    "proteinas" DOUBLE PRECISION NOT NULL,
    "carboidratos" DOUBLE PRECISION NOT NULL,
    "gorduras" DOUBLE PRECISION NOT NULL,
    "categoria" VARCHAR(100) DEFAULT 'Geral',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "fibras" DOUBLE PRECISION DEFAULT 0,
    "fonte" VARCHAR(50) DEFAULT 'TACO',

    CONSTRAINT "alimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 45,
    "type" VARCHAR(100) NOT NULL DEFAULT 'Consulta de Rotina',
    "room" VARCHAR(50),
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "health_insurance" VARCHAR(100),
    "payment_status" VARCHAR(20) DEFAULT 'PENDENTE',
    "payment_type" VARCHAR(20) DEFAULT 'PARTICULAR',
    "price" DECIMAL(10,2),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_role" VARCHAR(40) NOT NULL,
    "action_type" VARCHAR(60) NOT NULL,
    "category" "AuditCategory" NOT NULL,
    "target_entity" VARCHAR(60) NOT NULL,
    "target_entity_id" UUID,
    "patient_id" UUID,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'NORMAL',
    "metadata_sanitized" JSONB NOT NULL DEFAULT '{}',
    "ip_hash" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_measurements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "consultation_id" UUID,
    "measured_at" TIMESTAMPTZ(6) NOT NULL,
    "weight_kg" DECIMAL(5,2) NOT NULL,
    "bmi" DECIMAL(4,2) NOT NULL,
    "waist_circumference_cm" DECIMAL(5,2),
    "body_fat_percentage" DECIMAL(4,2),
    "skeletal_muscle_kg" DECIMAL(5,2),
    "source_type" "MeasurementSourceType" NOT NULL,
    "is_validated_by_staff" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "biometric_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "responsible_professional_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "clinical_objectives" TEXT NOT NULL,
    "status" "CarePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "care_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkins_hidratacao" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "volumeMl" INTEGER NOT NULL,
    "metaDiariaMl" INTEGER NOT NULL DEFAULT 2500,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkins_hidratacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkins_intestinais" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "tipoBristol" INTEGER NOT NULL,
    "categoria" TEXT NOT NULL,
    "sintomas" TEXT[],
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkins_intestinais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkins_sono" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "horas" DOUBLE PRECISION NOT NULL,
    "qualidade" VARCHAR(50) NOT NULL DEFAULT 'BOM',
    "observacao" TEXT,
    "data" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "checkins_sono_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_settings" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'default',
    "name" VARCHAR(200) NOT NULL DEFAULT 'Instituto Vida Metabólica',
    "logo_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clinic_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "parent_consultation_id" UUID,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "event_type" "ConsultationEventType" NOT NULL,
    "consultation_date" TIMESTAMPTZ(6) NOT NULL,
    "soap_subjective" TEXT,
    "soap_objective" TEXT,
    "soap_assessment" TEXT,
    "soap_plan" TEXT,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'DRAFT',
    "amendment_reason" TEXT,
    "finalized_at" TIMESTAMPTZ(6),
    "integrity_checksum" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "health_insurance" VARCHAR(100),
    "payment_status" VARCHAR(20) DEFAULT 'PENDENTE',
    "payment_type" VARCHAR(20) DEFAULT 'PARTICULAR',
    "price" DECIMAL(10,2),

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_meal_items" (
    "id" UUID NOT NULL,
    "diet_meal_id" UUID NOT NULL,
    "taco_food_code" VARCHAR(40),
    "food_name" VARCHAR(160) NOT NULL,
    "household_measure" VARCHAR(80),
    "quantity_grams" DECIMAL(6,2) NOT NULL,
    "calculated_kcal" DECIMAL(6,2) NOT NULL,
    "calculated_protein_g" DECIMAL(6,2) NOT NULL,
    "calculated_carbs_g" DECIMAL(6,2) NOT NULL,
    "calculated_fat_g" DECIMAL(6,2) NOT NULL,
    "macro_tag" "FoodMacroTag" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "diet_meal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_meals" (
    "id" UUID NOT NULL,
    "diet_plan_id" UUID NOT NULL,
    "meal_name" VARCHAR(80) NOT NULL,
    "suggested_time" VARCHAR(10) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 1,
    "period_icon" "MealPeriodIcon" NOT NULL DEFAULT 'morning',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "diet_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "author_professional_id" UUID NOT NULL,
    "parent_diet_plan_id" UUID,
    "version_label" VARCHAR(30) NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "title" VARCHAR(160) NOT NULL,
    "goal_description" VARCHAR(255),
    "target_kcal" INTEGER NOT NULL,
    "target_protein_g" DECIMAL(6,2) NOT NULL,
    "target_carbs_g" DECIMAL(6,2) NOT NULL,
    "target_fat_g" DECIMAL(6,2) NOT NULL,
    "general_guidelines" JSONB NOT NULL DEFAULT '[]',
    "status" "DietPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE,
    "effective_until" DATE,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "diet_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_substitutions" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "prescribed_diet_item_id" UUID NOT NULL,
    "substitute_food_id" UUID,
    "substitute_food_name" VARCHAR(160) NOT NULL,
    "quantity_grams" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "calories" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proteins" DOUBLE PRECISION DEFAULT 0,
    "carbohydrates" DOUBLE PRECISION DEFAULT 0,
    "fats" DOUBLE PRECISION DEFAULT 0,
    "date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "diet_substitutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evolucoes_clinicas" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "data_atendimento" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "peso_atual" DOUBLE PRECISION,
    "altura_cm" DOUBLE PRECISION,
    "imc" DOUBLE PRECISION,
    "queixa_principal" TEXT,
    "conduta_evolucao" TEXT NOT NULL,
    "medico_responsavel" VARCHAR(160) NOT NULL DEFAULT 'Dr. Carlos Fantini',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evolucoes_clinicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foods" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "base_portion" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "calories" DOUBLE PRECISION NOT NULL,
    "proteins" DOUBLE PRECISION NOT NULL,
    "carbohydrates" DOUBLE PRECISION NOT NULL,
    "fats" DOUBLE PRECISION NOT NULL,
    "fiber" DOUBLE PRECISION DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_checkins" (
    "id" UUID NOT NULL,
    "patient_goal_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "reference_date" DATE NOT NULL,
    "recorded_value" DECIMAL(10,2) NOT NULL,
    "symptom_payload" JSONB,
    "origin" "CheckinOrigin" NOT NULL DEFAULT 'PATIENT_ANDROID_APP',
    "idempotency_key" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "goal_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_refeicoes" (
    "id" UUID NOT NULL,
    "refeicao_id" UUID NOT NULL,
    "alimento_id" UUID NOT NULL,
    "quantidade_gramas" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "observacao" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "itens_refeicoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicos" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "especialidade" VARCHAR(120),
    "cor_hex" VARCHAR(20) NOT NULL DEFAULT '#059669',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "medicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL,
    "trade_name" VARCHAR(150) NOT NULL,
    "tax_id" VARCHAR(20) NOT NULL,
    "primary_color_hex" VARCHAR(7) NOT NULL DEFAULT '#059669',
    "logo_storage_key" VARCHAR(255),
    "enabled_modules" JSONB NOT NULL DEFAULT '{}',
    "role_permissions" JSONB DEFAULT '{}',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_goals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "care_plan_id" UUID,
    "category" "GoalCategory" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "target_value" DECIMAL(10,2) NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "frequency" "GoalFrequency" NOT NULL DEFAULT 'DAILY',
    "is_enabled_in_app" BOOLEAN NOT NULL DEFAULT true,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "patient_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "record_code" VARCHAR(40) NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "social_name" VARCHAR(160),
    "cpf" VARCHAR(14),
    "rg" VARCHAR(20),
    "birth_date" DATE,
    "biological_sex" "BiologicalSex",
    "height_cm" DECIMAL(5,2),
    "phone_whatsapp" VARCHAR(30) NOT NULL DEFAULT '',
    "email" VARCHAR(160),
    "clinical_focus" VARCHAR(200),
    "zip_code" VARCHAR(10),
    "street" VARCHAR(200),
    "number" VARCHAR(30),
    "complement" VARCHAR(100),
    "neighborhood" VARCHAR(100),
    "city" VARCHAR(100),
    "state" VARCHAR(2),
    "primary_doctor_id" UUID,
    "primary_nutritionist_id" UUID,
    "patient_status" "PatientStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "photo_url" TEXT,
    "active_modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meta_diaria_ml" INTEGER NOT NULL DEFAULT 2500,
    "contato_emergencia_nome" VARCHAR(160),
    "contato_emergencia_telefone" VARCHAR(30),
    "convenio" VARCHAR(50) NOT NULL DEFAULT 'Particular',
    "estado_civil" VARCHAR(30),
    "profissao" VARCHAR(100),
    "telefone_secundario" VARCHAR(30),
    "plano_faaz" BOOLEAN NOT NULL DEFAULT false,
    "avatar_url" TEXT,
    "treatment_objective" VARCHAR(200),
    "workout_duration" INTEGER,
    "workout_frequency" INTEGER,
    "workout_restrictions" TEXT,
    "workout_type" VARCHAR(100),

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos_alimentares" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "titulo" VARCHAR(160) NOT NULL DEFAULT 'Plano Alimentar',
    "objetivo" VARCHAR(255),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "planos_alimentares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prontuarios_pacientes" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "peso_atual_kg" DECIMAL(5,2),
    "altura_cm" DECIMAL(5,2),
    "imc" DECIMAL(4,2),
    "objetivo" TEXT,
    "comorbidades" TEXT,
    "alergias" TEXT,
    "medicacoes" TEXT,
    "evolucao" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "prontuarios_pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refeicoes" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "horario" VARCHAR(10),
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "variacao_dieta_id" UUID NOT NULL,

    CONSTRAINT "refeicoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_glicemia" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "data_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valor" INTEGER NOT NULL,
    "momento" VARCHAR(30) NOT NULL DEFAULT 'JEJUM',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_glicemia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "username" VARCHAR(60) NOT NULL,
    "email" VARCHAR(160),
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "council_type" VARCHAR(20),
    "council_number" VARCHAR(40),
    "specialty" VARCHAR(100),
    "room_number" VARCHAR(50),
    "is_clinical" BOOLEAN NOT NULL DEFAULT false,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret_encrypted" TEXT,
    "account_status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "title" VARCHAR(20),
    "cargo" "Cargo" NOT NULL DEFAULT 'DONO_CLINICA',
    "pode_acessar_prontuario" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variacoes_dieta" (
    "id" UUID NOT NULL,
    "plano_alimentar_id" UUID NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "descricao" VARCHAR(255),
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "variacoes_dieta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_logs" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agendamentos_data_hora_idx" ON "agendamentos"("data_hora" ASC);

-- CreateIndex
CREATE INDEX "agendamentos_especialidade_data_hora_idx" ON "agendamentos"("especialidade" ASC, "data_hora" ASC);

-- CreateIndex
CREATE INDEX "agendamentos_medico_id_data_hora_idx" ON "agendamentos"("medico_id" ASC, "data_hora" ASC);

-- CreateIndex
CREATE INDEX "agendamentos_paciente_id_data_hora_idx" ON "agendamentos"("paciente_id" ASC, "data_hora" DESC);

-- CreateIndex
CREATE INDEX "alimentos_categoria_idx" ON "alimentos"("categoria" ASC);

-- CreateIndex
CREATE INDEX "alimentos_nome_idx" ON "alimentos"("nome" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "alimentos_nome_key" ON "alimentos"("nome" ASC);

-- CreateIndex
CREATE INDEX "appointments_organization_id_date_idx" ON "appointments"("organization_id" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id" ASC);

-- CreateIndex
CREATE INDEX "appointments_professional_id_idx" ON "appointments"("professional_id" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_patient_id_created_at_idx" ON "audit_logs"("patient_id" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "biometric_measurements_patient_id_measured_at_idx" ON "biometric_measurements"("patient_id" ASC, "measured_at" DESC);

-- CreateIndex
CREATE INDEX "care_plans_patient_id_status_idx" ON "care_plans"("patient_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "checkins_sono_paciente_id_data_idx" ON "checkins_sono"("paciente_id" ASC, "data" DESC);

-- CreateIndex
CREATE INDEX "consultations_parent_consultation_id_idx" ON "consultations"("parent_consultation_id" ASC);

-- CreateIndex
CREATE INDEX "consultations_patient_id_consultation_date_idx" ON "consultations"("patient_id" ASC, "consultation_date" DESC);

-- CreateIndex
CREATE INDEX "diet_meal_items_diet_meal_id_idx" ON "diet_meal_items"("diet_meal_id" ASC);

-- CreateIndex
CREATE INDEX "diet_meals_diet_plan_id_sort_order_idx" ON "diet_meals"("diet_plan_id" ASC, "sort_order" ASC);

-- CreateIndex
CREATE INDEX "diet_plans_patient_id_status_version_number_idx" ON "diet_plans"("patient_id" ASC, "status" ASC, "version_number" DESC);

-- CreateIndex
CREATE INDEX "diet_substitutions_patient_id_date_idx" ON "diet_substitutions"("patient_id" ASC, "date" DESC);

-- CreateIndex
CREATE INDEX "diet_substitutions_prescribed_diet_item_id_idx" ON "diet_substitutions"("prescribed_diet_item_id" ASC);

-- CreateIndex
CREATE INDEX "evolucoes_clinicas_paciente_id_data_atendimento_idx" ON "evolucoes_clinicas"("paciente_id" ASC, "data_atendimento" DESC);

-- CreateIndex
CREATE INDEX "foods_category_idx" ON "foods"("category" ASC);

-- CreateIndex
CREATE INDEX "foods_name_idx" ON "foods"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "foods_name_key" ON "foods"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "goal_checkins_idempotency_key_key" ON "goal_checkins"("idempotency_key" ASC);

-- CreateIndex
CREATE INDEX "goal_checkins_patient_goal_id_reference_date_idx" ON "goal_checkins"("patient_goal_id" ASC, "reference_date" DESC);

-- CreateIndex
CREATE INDEX "goal_checkins_patient_id_reference_date_idx" ON "goal_checkins"("patient_id" ASC, "reference_date" DESC);

-- CreateIndex
CREATE INDEX "itens_refeicoes_alimento_id_idx" ON "itens_refeicoes"("alimento_id" ASC);

-- CreateIndex
CREATE INDEX "itens_refeicoes_refeicao_id_idx" ON "itens_refeicoes"("refeicao_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_tax_id_key" ON "organizations"("tax_id" ASC);

-- CreateIndex
CREATE INDEX "patient_goals_patient_id_status_is_enabled_in_app_idx" ON "patient_goals"("patient_id" ASC, "status" ASC, "is_enabled_in_app" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "patients_organization_id_cpf_key" ON "patients"("organization_id" ASC, "cpf" ASC);

-- CreateIndex
CREATE INDEX "patients_organization_id_full_name_idx" ON "patients"("organization_id" ASC, "full_name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "patients_record_code_key" ON "patients"("record_code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "patients_user_id_key" ON "patients"("user_id" ASC);

-- CreateIndex
CREATE INDEX "planos_alimentares_paciente_id_idx" ON "planos_alimentares"("paciente_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "prontuarios_pacientes_paciente_id_key" ON "prontuarios_pacientes"("paciente_id" ASC);

-- CreateIndex
CREATE INDEX "refeicoes_variacao_dieta_id_ordem_idx" ON "refeicoes"("variacao_dieta_id" ASC, "ordem" ASC);

-- CreateIndex
CREATE INDEX "registros_glicemia_data_registro_idx" ON "registros_glicemia"("data_registro" DESC);

-- CreateIndex
CREATE INDEX "registros_glicemia_paciente_id_data_registro_idx" ON "registros_glicemia"("paciente_id" ASC, "data_registro" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email" ASC);

-- CreateIndex
CREATE INDEX "users_organization_id_role_idx" ON "users"("organization_id" ASC, "role" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username" ASC);

-- CreateIndex
CREATE INDEX "variacoes_dieta_plano_alimentar_id_ordem_idx" ON "variacoes_dieta"("plano_alimentar_id" ASC, "ordem" ASC);

-- CreateIndex
CREATE INDEX "workout_logs_patient_id_date_idx" ON "workout_logs"("patient_id" ASC, "date" DESC);

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_medico_id_fkey" FOREIGN KEY ("medico_id") REFERENCES "medicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_measurements" ADD CONSTRAINT "biometric_measurements_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_measurements" ADD CONSTRAINT "biometric_measurements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_measurements" ADD CONSTRAINT "biometric_measurements_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_responsible_professional_id_fkey" FOREIGN KEY ("responsible_professional_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins_sono" ADD CONSTRAINT "checkins_sono_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_parent_consultation_id_fkey" FOREIGN KEY ("parent_consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_meal_items" ADD CONSTRAINT "diet_meal_items_diet_meal_id_fkey" FOREIGN KEY ("diet_meal_id") REFERENCES "diet_meals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_meals" ADD CONSTRAINT "diet_meals_diet_plan_id_fkey" FOREIGN KEY ("diet_plan_id") REFERENCES "diet_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_author_professional_id_fkey" FOREIGN KEY ("author_professional_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_parent_diet_plan_id_fkey" FOREIGN KEY ("parent_diet_plan_id") REFERENCES "diet_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_substitutions" ADD CONSTRAINT "diet_substitutions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_substitutions" ADD CONSTRAINT "diet_substitutions_prescribed_diet_item_id_fkey" FOREIGN KEY ("prescribed_diet_item_id") REFERENCES "itens_refeicoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_substitutions" ADD CONSTRAINT "diet_substitutions_substitute_food_id_fkey" FOREIGN KEY ("substitute_food_id") REFERENCES "alimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolucoes_clinicas" ADD CONSTRAINT "evolucoes_clinicas_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_checkins" ADD CONSTRAINT "goal_checkins_patient_goal_id_fkey" FOREIGN KEY ("patient_goal_id") REFERENCES "patient_goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_checkins" ADD CONSTRAINT "goal_checkins_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_refeicoes" ADD CONSTRAINT "itens_refeicoes_alimento_id_fkey" FOREIGN KEY ("alimento_id") REFERENCES "alimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_refeicoes" ADD CONSTRAINT "itens_refeicoes_refeicao_id_fkey" FOREIGN KEY ("refeicao_id") REFERENCES "refeicoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_goals" ADD CONSTRAINT "patient_goals_care_plan_id_fkey" FOREIGN KEY ("care_plan_id") REFERENCES "care_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_goals" ADD CONSTRAINT "patient_goals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_goals" ADD CONSTRAINT "patient_goals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_primary_doctor_id_fkey" FOREIGN KEY ("primary_doctor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_primary_nutritionist_id_fkey" FOREIGN KEY ("primary_nutritionist_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos_alimentares" ADD CONSTRAINT "planos_alimentares_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prontuarios_pacientes" ADD CONSTRAINT "prontuarios_pacientes_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refeicoes" ADD CONSTRAINT "refeicoes_variacao_dieta_id_fkey" FOREIGN KEY ("variacao_dieta_id") REFERENCES "variacoes_dieta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_glicemia" ADD CONSTRAINT "registros_glicemia_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variacoes_dieta" ADD CONSTRAINT "variacoes_dieta_plano_alimentar_id_fkey" FOREIGN KEY ("plano_alimentar_id") REFERENCES "planos_alimentares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

