// ============================================================================
// ENUMS DE DOMÍNIO — Oracle Autonomous Database
// ============================================================================
// O Oracle não possui tipo ENUM. Cada enum do antigo schema Prisma vira:
//   • no banco: coluna VARCHAR2 + CHECK constraint (ver database/oracle/*.sql)
//   • no código: array `as const` (validação/zod) + union type TypeScript
// Os valores são idênticos aos do schema PostgreSQL, então os dados migram 1:1.

export const ORGANIZATION_STATUS = ["ACTIVE", "MAINTENANCE", "SUSPENDED"] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUS)[number];

export const USER_ROLE = [
  "SUPER_ADMIN",
  "CLINIC_ADMIN",
  "ADMIN",
  "DOCTOR",
  "NUTRITIONIST",
  "RECEPTIONIST",
  "STAFF",
  "PATIENT",
] as const;
export type UserRole = (typeof USER_ROLE)[number];

// Perfis de Acesso e Permissões Clínicas (RBAC v2.0 - Clínica FAAZ)
export const CARGO = ["DONO_CLINICA", "MEDICO", "SECRETARIA", "ADMINISTRADOR"] as const;
export type Cargo = (typeof CARGO)[number];

export const ACCOUNT_STATUS = ["PENDING_INVITE", "ACTIVE", "REVOKED", "LOCKED"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUS)[number];

export const BIOLOGICAL_SEX = ["FEMALE", "MALE", "OTHER"] as const;
export type BiologicalSex = (typeof BIOLOGICAL_SEX)[number];

export const PATIENT_STATUS = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export type PatientStatus = (typeof PATIENT_STATUS)[number];

export const CONSULTATION_EVENT_TYPE = [
  "ROUTINE_CONSULTATION",
  "NUTRITION_EVALUATION",
  "LAB_REVIEW",
  "CLINICAL_ADDENDUM",
] as const;
export type ConsultationEventType = (typeof CONSULTATION_EVENT_TYPE)[number];

export const CONSULTATION_STATUS = [
  "DRAFT",
  "FINALIZED",
  "SUPERSEDED",
  "ANNULLED_WITH_JUSTIFICATION",
] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUS)[number];

export const APPOINTMENT_STATUS = [
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "CANCELLED",
  "COMPLETED",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[number];

export const MEASUREMENT_SOURCE_TYPE = [
  "CLINICAL_BIOIMPEDANCE",
  "CLINICAL_SCALE",
  "PATIENT_APP_SELF_REPORT",
] as const;
export type MeasurementSourceType = (typeof MEASUREMENT_SOURCE_TYPE)[number];

export const CARE_PLAN_STATUS = ["DRAFT", "PUBLISHED", "SUSPENDED", "COMPLETED"] as const;
export type CarePlanStatus = (typeof CARE_PLAN_STATUS)[number];

export const DIET_PLAN_STATUS = [
  "DRAFT",
  "UNDER_REVIEW",
  "PUBLISHED",
  "ARCHIVED",
  "SUSPENDED",
] as const;
export type DietPlanStatus = (typeof DIET_PLAN_STATUS)[number];

export const MEAL_PERIOD_ICON = ["morning", "noon", "afternoon", "night"] as const;
export type MealPeriodIcon = (typeof MEAL_PERIOD_ICON)[number];

export const FOOD_MACRO_TAG = ["PROTEIN", "CARB", "FIBER_MICRO", "HEALTHY_FAT"] as const;
export type FoodMacroTag = (typeof FOOD_MACRO_TAG)[number];

export const GOAL_CATEGORY = [
  "HYDRATION",
  "CALORIE_BURN",
  "SYMPTOM_DIARY",
  "STEPS",
  "FASTING_WINDOW",
  "CAPILLARY_GLUCOSE",
] as const;
export type GoalCategory = (typeof GOAL_CATEGORY)[number];

export const GOAL_FREQUENCY = ["DAILY", "WEEKLY", "CUSTOM"] as const;
export type GoalFrequency = (typeof GOAL_FREQUENCY)[number];

export const GOAL_STATUS = ["ACTIVE", "PAUSED", "COMPLETED", "REPLACED"] as const;
export type GoalStatus = (typeof GOAL_STATUS)[number];

export const CHECKIN_ORIGIN = ["PATIENT_ANDROID_APP", "CLINICAL_WEB_PANEL"] as const;
export type CheckinOrigin = (typeof CHECKIN_ORIGIN)[number];

export const AUDIT_CATEGORY = [
  "CLINICAL_ACCESS",
  "MEDICAL_RECORD",
  "SECURITY_AND_AUTH",
  "SYSTEM",
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORY)[number];

export const AUDIT_SEVERITY = ["NORMAL", "HIGH", "CRITICAL"] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITY)[number];
