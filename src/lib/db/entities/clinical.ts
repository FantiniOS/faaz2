import { EntitySchema } from "typeorm";
import {
  auditColumns,
  bool,
  clob,
  decimal,
  float,
  integer,
  json,
  timestampTz,
  uuidPrimary,
  uuidRef,
  varchar,
  type AuditFields,
} from "./columns";
import type {
  CheckinOrigin,
  GoalCategory,
  GoalFrequency,
  GoalStatus,
  MeasurementSourceType,
} from "./enums";
import type { Organization } from "./organization";
import type { Patient } from "./patient";

// ============================================================================
// 5. BIOMETRIC_MEASUREMENTS (Série Temporal de Peso, IMC e Biomarcadores)
// ============================================================================
export interface BiometricMeasurement extends AuditFields {
  id: string;
  organizationId: string;
  patientId: string;
  consultationId: string | null;
  measuredAt: Date;
  weightKg: number;
  bmi: number;
  waistCircumferenceCm: number | null;
  bodyFatPercentage: number | null;
  skeletalMuscleKg: number | null;
  sourceType: MeasurementSourceType;
  isValidatedByStaff: boolean;

  organization?: Organization;
  patient?: Patient;
}

export const BiometricMeasurementEntity = new EntitySchema<BiometricMeasurement>({
  name: "BiometricMeasurement",
  tableName: "BIOMETRIC_MEASUREMENTS",
  columns: {
    id: uuidPrimary,
    organizationId: uuidRef("ORGANIZATION_ID"),
    patientId: uuidRef("PATIENT_ID"),
    consultationId: uuidRef("CONSULTATION_ID", true),
    measuredAt: timestampTz("MEASURED_AT"),
    weightKg: decimal("WEIGHT_KG", 5, 2),
    bmi: decimal("BMI", 4, 2),
    waistCircumferenceCm: decimal("WAIST_CIRCUMFERENCE_CM", 5, 2, true),
    bodyFatPercentage: decimal("BODY_FAT_PERCENTAGE", 4, 2, true),
    skeletalMuscleKg: decimal("SKELETAL_MUSCLE_KG", 5, 2, true),
    sourceType: varchar("SOURCE_TYPE", 30),
    isValidatedByStaff: { ...bool("IS_VALIDATED_BY_STAFF"), default: false },
    ...auditColumns,
  },
  relations: {
    organization: {
      type: "many-to-one",
      target: "Organization",
      joinColumn: { name: "ORGANIZATION_ID" },
    },
    patient: {
      type: "many-to-one",
      target: "Patient",
      inverseSide: "biometricMeasurements",
      joinColumn: { name: "PATIENT_ID" },
    },
  },
});

// ============================================================================
// 10. PATIENT_GOALS (Metas e Módulos Ativos no App Android)
// ============================================================================
export interface PatientGoal extends AuditFields {
  id: string;
  organizationId: string;
  patientId: string;
  carePlanId: string | null;
  category: GoalCategory;
  title: string;
  targetValue: number;
  unit: string;
  frequency: GoalFrequency;
  isEnabledInApp: boolean;
  status: GoalStatus;

  patient?: Patient;
  checkins?: GoalCheckin[];
}

export const PatientGoalEntity = new EntitySchema<PatientGoal>({
  name: "PatientGoal",
  tableName: "PATIENT_GOALS",
  columns: {
    id: uuidPrimary,
    organizationId: uuidRef("ORGANIZATION_ID"),
    patientId: uuidRef("PATIENT_ID"),
    carePlanId: uuidRef("CARE_PLAN_ID", true),
    category: varchar("CATEGORY", 30),
    title: varchar("TITLE", 120),
    targetValue: decimal("TARGET_VALUE", 10, 2),
    unit: varchar("UNIT", 30),
    frequency: { ...varchar("FREQUENCY", 20), default: "DAILY" },
    isEnabledInApp: { ...bool("IS_ENABLED_IN_APP"), default: true },
    status: { ...varchar("STATUS", 20), default: "ACTIVE" },
    ...auditColumns,
  },
  relations: {
    patient: {
      type: "many-to-one",
      target: "Patient",
      inverseSide: "patientGoals",
      joinColumn: { name: "PATIENT_ID" },
    },
    checkins: {
      type: "one-to-many",
      target: "GoalCheckin",
      inverseSide: "patientGoal",
    },
  },
});

// ============================================================================
// 11. GOAL_CHECKINS (Registros Diários do Paciente no App)
// ============================================================================
export interface GoalCheckin extends AuditFields {
  id: string;
  patientGoalId: string;
  patientId: string;
  referenceDate: Date | string;
  recordedValue: number;
  symptomPayload: Record<string, unknown> | null;
  origin: CheckinOrigin;
  idempotencyKey: string | null;

  patientGoal?: PatientGoal;
  patient?: Patient;
}

export const GoalCheckinEntity = new EntitySchema<GoalCheckin>({
  name: "GoalCheckin",
  tableName: "GOAL_CHECKINS",
  columns: {
    id: uuidPrimary,
    patientGoalId: uuidRef("PATIENT_GOAL_ID"),
    patientId: uuidRef("PATIENT_ID"),
    referenceDate: { name: "REFERENCE_DATE", type: "date", nullable: false },
    recordedValue: decimal("RECORDED_VALUE", 10, 2),
    symptomPayload: json("SYMPTOM_PAYLOAD", true),
    origin: { ...varchar("ORIGIN", 30), default: "PATIENT_ANDROID_APP" },
    idempotencyKey: varchar("IDEMPOTENCY_KEY", 80, true),
    ...auditColumns,
  },
  relations: {
    patientGoal: {
      type: "many-to-one",
      target: "PatientGoal",
      inverseSide: "checkins",
      joinColumn: { name: "PATIENT_GOAL_ID" },
    },
    patient: {
      type: "many-to-one",
      target: "Patient",
      inverseSide: "goalCheckins",
      joinColumn: { name: "PATIENT_ID" },
    },
  },
});

// ============================================================================
// 18. PRONTUARIOS_PACIENTES (Ficha Clínica Digital do Paciente)
// ============================================================================
export interface ProntuarioPaciente {
  id: string;
  pacienteId: string;
  pesoAtualKg: number | null;
  alturaCm: number | null;
  imc: number | null;
  objetivo: string | null;
  comorbidades: string | null;
  alergias: string | null;
  medicacoes: string | null;
  evolucao: string | null;
  createdAt: Date;
  updatedAt: Date;

  patient?: Patient;
}

export const ProntuarioPacienteEntity = new EntitySchema<ProntuarioPaciente>({
  name: "ProntuarioPaciente",
  tableName: "PRONTUARIOS_PACIENTES",
  columns: {
    id: uuidPrimary,
    pacienteId: uuidRef("PACIENTE_ID"),
    pesoAtualKg: decimal("PESO_ATUAL_KG", 5, 2, true),
    alturaCm: decimal("ALTURA_CM", 5, 2, true),
    imc: decimal("IMC", 4, 2, true),
    objetivo: clob("OBJETIVO"),
    comorbidades: clob("COMORBIDADES"),
    alergias: clob("ALERGIAS"),
    medicacoes: clob("MEDICACOES"),
    evolucao: clob("EVOLUCAO"),
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    patient: {
      type: "one-to-one",
      target: "Patient",
      inverseSide: "prontuario",
      joinColumn: { name: "PACIENTE_ID" },
      onDelete: "CASCADE",
    },
  },
});

// ============================================================================
// 19. EVOLUCOES_CLINICAS (Histórico de Consultas e Linha do Tempo)
// ============================================================================
export interface EvolucaoClinica {
  id: string;
  pacienteId: string;
  dataAtendimento: Date;
  pesoAtual: number | null;
  alturaCm: number | null;
  imc: number | null;
  queixaPrincipal: string | null;
  condutaEvolucao: string;
  medicoResponsavel: string;
  createdAt: Date;
  updatedAt: Date;

  patient?: Patient;
}

export const EvolucaoClinicaEntity = new EntitySchema<EvolucaoClinica>({
  name: "EvolucaoClinica",
  tableName: "EVOLUCOES_CLINICAS",
  columns: {
    id: uuidPrimary,
    pacienteId: uuidRef("PACIENTE_ID"),
    dataAtendimento: timestampTz("DATA_ATENDIMENTO"),
    pesoAtual: float("PESO_ATUAL", true),
    alturaCm: float("ALTURA_CM", true),
    imc: float("IMC", true),
    queixaPrincipal: clob("QUEIXA_PRINCIPAL"),
    condutaEvolucao: clob("CONDUTA_EVOLUCAO", false),
    medicoResponsavel: {
      ...varchar("MEDICO_RESPONSAVEL", 160),
      default: "Dr. Carlos Fantini",
    },
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    patient: {
      type: "many-to-one",
      target: "Patient",
      inverseSide: "evolucoesClinicas",
      joinColumn: { name: "PACIENTE_ID" },
      onDelete: "CASCADE",
    },
  },
});

// ============================================================================
// 20. REGISTROS_GLICEMIA (Monitoramento Bidirecional de Glicemia Capilar)
// ============================================================================
export interface RegistroGlicemia {
  id: string;
  pacienteId: string;
  dataRegistro: Date;
  valor: number;
  momento: string;
  createdAt: Date;

  paciente?: Patient;
}

export const RegistroGlicemiaEntity = new EntitySchema<RegistroGlicemia>({
  name: "RegistroGlicemia",
  tableName: "REGISTROS_GLICEMIA",
  columns: {
    id: uuidPrimary,
    pacienteId: uuidRef("PACIENTE_ID"),
    dataRegistro: timestampTz("DATA_REGISTRO"),
    valor: integer("VALOR"),
    momento: { ...varchar("MOMENTO", 30), default: "JEJUM" },
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
  },
  relations: {
    paciente: {
      type: "many-to-one",
      target: "Patient",
      inverseSide: "registrosGlicemia",
      joinColumn: { name: "PACIENTE_ID" },
      onDelete: "CASCADE",
    },
  },
});

// ============================================================================
// 21. MEDICOS (Corpo Clínico / Profissionais da Agenda da Clínica FAAZ)
// ============================================================================
export interface Medico {
  id: string;
  nome: string;
  especialidade: string | null;
  corHex: string;
  createdAt: Date;
  updatedAt: Date;

  agendamentos?: Agendamento[];
}

export const MedicoEntity = new EntitySchema<Medico>({
  name: "Medico",
  tableName: "MEDICOS",
  columns: {
    id: uuidPrimary,
    nome: varchar("NOME", 160),
    especialidade: varchar("ESPECIALIDADE", 120, true),
    corHex: { ...varchar("COR_HEX", 20), default: "#059669" },
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    agendamentos: {
      type: "one-to-many",
      target: "Agendamento",
      inverseSide: "medico",
    },
  },
});

// ============================================================================
// 22. AGENDAMENTOS (Agenda Diária de Consultas e Exames da Clínica FAAZ)
// ============================================================================
export interface Agendamento {
  id: string;
  pacienteId: string;
  medicoId: string;
  especialidade: string;
  dataHora: Date;
  duracaoMinutos: number;
  encaixe: boolean;
  tipo: string;
  status: string;
  observacao: string | null;
  createdAt: Date;
  updatedAt: Date;

  paciente?: Patient;
  medico?: Medico;
}

export const AgendamentoEntity = new EntitySchema<Agendamento>({
  name: "Agendamento",
  tableName: "AGENDAMENTOS",
  columns: {
    id: uuidPrimary,
    pacienteId: uuidRef("PACIENTE_ID"),
    medicoId: {
      ...uuidRef("MEDICO_ID"),
      default: "00000000-0000-4000-8000-000000000001",
    },
    especialidade: { ...varchar("ESPECIALIDADE", 40), default: "ENDOCRINOLOGIA" },
    dataHora: timestampTz("DATA_HORA"),
    duracaoMinutos: { ...integer("DURACAO_MINUTOS"), default: 30 },
    encaixe: { ...bool("ENCAIXE"), default: false },
    tipo: { ...varchar("TIPO", 40), default: "RETORNO" },
    status: { ...varchar("STATUS", 30), default: "AGENDADO" },
    observacao: clob("OBSERVACAO"),
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    paciente: {
      type: "many-to-one",
      target: "Patient",
      inverseSide: "agendamentos",
      joinColumn: { name: "PACIENTE_ID" },
      onDelete: "CASCADE",
    },
    medico: {
      type: "many-to-one",
      target: "Medico",
      inverseSide: "agendamentos",
      joinColumn: { name: "MEDICO_ID" },
    },
  },
});

// ============================================================================
// 30. MEASUREMENTS (Antropometria, Circunferências e Composição Corporal)
// ============================================================================
export interface Measurement {
  id: string;
  patientId: string;
  measuredAt: Date;
  bodyFatPercentage: number | null;
  waist: number | null;
  abdomen: number | null;
  hips: number | null;
  rightArm: number | null;
  leftArm: number | null;
  rightThigh: number | null;
  leftThigh: number | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;

  patient?: Patient;
}

export const MeasurementEntity = new EntitySchema<Measurement>({
  name: "Measurement",
  tableName: "MEASUREMENTS",
  columns: {
    id: uuidPrimary,
    patientId: uuidRef("PATIENT_ID"),
    measuredAt: timestampTz("MEASURED_AT"),
    bodyFatPercentage: float("BODY_FAT_PERCENTAGE", true),
    waist: float("WAIST", true),
    abdomen: float("ABDOMEN", true),
    hips: float("HIPS", true),
    rightArm: float("RIGHT_ARM", true),
    leftArm: float("LEFT_ARM", true),
    rightThigh: float("RIGHT_THIGH", true),
    leftThigh: float("LEFT_THIGH", true),
    notes: varchar("NOTES", 255, true),
    createdBy: uuidRef("CREATED_BY", true),
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    patient: {
      type: "many-to-one",
      target: "Patient",
      inverseSide: "measurements",
      joinColumn: { name: "PATIENT_ID" },
      onDelete: "CASCADE",
    },
  },
});

// ============================================================================
// 31. DOCUMENT_TEMPLATES (Modelos Clínicos Salvos - Receitas/Exames/Atestados)
// ============================================================================
export interface DocumentTemplate {
  id: string;
  title: string;
  content: string;
  category: string;
  documentTitle: string | null;
  organizationId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const DocumentTemplateEntity = new EntitySchema<DocumentTemplate>({
  name: "DocumentTemplate",
  tableName: "DOCUMENT_TEMPLATES",
  columns: {
    id: uuidPrimary,
    title: varchar("TITLE", 160),
    content: clob("CONTENT", false),
    category: varchar("CATEGORY", 40),
    documentTitle: varchar("DOCUMENT_TITLE", 200, true),
    organizationId: uuidRef("ORGANIZATION_ID", true),
    createdBy: uuidRef("CREATED_BY", true),
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
});
