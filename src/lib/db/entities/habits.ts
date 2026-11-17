import { EntitySchema } from "typeorm";
import {
  clob,
  float,
  integer,
  json,
  timestampTz,
  uuidPrimary,
  uuidRef,
  varchar,
} from "./columns";
import type { Patient } from "./patient";

// ============================================================================
// 15. FOODS (Banco de Alimentos legado - TSK-084)
// ============================================================================
export interface Food {
  id: string;
  name: string;
  category: string;
  basePortion: number;
  calories: number;
  proteins: number;
  carbohydrates: number;
  fats: number;
  fiber: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export const FoodEntity = new EntitySchema<Food>({
  name: "Food",
  tableName: "FOODS",
  columns: {
    id: uuidPrimary,
    name: varchar("NAME", 255),
    category: varchar("CATEGORY", 100),
    basePortion: { ...float("BASE_PORTION", false), default: 100 },
    calories: float("CALORIES", false),
    proteins: float("PROTEINS", false),
    carbohydrates: float("CARBOHYDRATES", false),
    fats: float("FATS", false),
    fiber: { ...float("FIBER", true), default: 0 },
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
});

// ============================================================================
// 16. CHECKINS_INTESTINAIS (Módulo Saúde Intestinal - Escala de Bristol)
// ============================================================================
export interface CheckinIntestinal {
  id: string;
  pacienteId: string;
  tipoBristol: number;
  categoria: string;
  /** Era String[] no PostgreSQL; no Oracle é array JSON em CLOB. */
  sintomas: string[];
  data: Date;
}

export const CheckinIntestinalEntity = new EntitySchema<CheckinIntestinal>({
  name: "CheckinIntestinal",
  tableName: "CHECKINS_INTESTINAIS",
  columns: {
    id: uuidPrimary,
    pacienteId: varchar("PACIENTE_ID", 36),
    tipoBristol: integer("TIPO_BRISTOL"),
    categoria: varchar("CATEGORIA", 40),
    sintomas: json("SINTOMAS"),
    data: { ...timestampTz("DATA"), createDate: true },
  },
});

// ============================================================================
// 17. CHECKINS_HIDRATACAO (Módulo de Aderência Hídrica)
// ============================================================================
export interface CheckinHidratacao {
  id: string;
  pacienteId: string;
  volumeMl: number;
  metaDiariaMl: number;
  data: Date;
}

export const CheckinHidratacaoEntity = new EntitySchema<CheckinHidratacao>({
  name: "CheckinHidratacao",
  tableName: "CHECKINS_HIDRATACAO",
  columns: {
    id: uuidPrimary,
    pacienteId: varchar("PACIENTE_ID", 36),
    volumeMl: integer("VOLUME_ML"),
    metaDiariaMl: { ...integer("META_DIARIA_ML"), default: 2500 },
    data: { ...timestampTz("DATA"), createDate: true },
  },
});

// ============================================================================
// 27. CHECKINS_SONO (Módulo Sono & Recuperação do Paciente via App)
// ============================================================================
export interface CheckInSono {
  id: string;
  pacienteId: string;
  horas: number;
  qualidade: string;
  observacao: string | null;
  data: Date;
  createdAt: Date;
  updatedAt: Date;

  paciente?: Patient;
}

export const CheckInSonoEntity = new EntitySchema<CheckInSono>({
  name: "CheckInSono",
  tableName: "CHECKINS_SONO",
  columns: {
    id: uuidPrimary,
    pacienteId: uuidRef("PACIENTE_ID"),
    horas: float("HORAS", false),
    qualidade: { ...varchar("QUALIDADE", 50), default: "BOM" },
    observacao: clob("OBSERVACAO"),
    data: { ...timestampTz("DATA"), createDate: true },
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    paciente: {
      type: "many-to-one",
      target: "Patient",
      inverseSide: "checkinsSono",
      joinColumn: { name: "PACIENTE_ID" },
      onDelete: "CASCADE",
    },
  },
});

// ============================================================================
// 28. WORKOUT_LOGS (Habit Tracker de Treinos / Atividade Física)
// ============================================================================
export interface WorkoutLog {
  id: string;
  patientId: string;
  /** Coluna LOG_DATE (DATE é palavra reservada no Oracle). */
  date: Date;
  createdAt: Date;
  updatedAt: Date;

  patient?: Patient;
}

export const WorkoutLogEntity = new EntitySchema<WorkoutLog>({
  name: "WorkoutLog",
  tableName: "WORKOUT_LOGS",
  columns: {
    id: uuidPrimary,
    patientId: uuidRef("PATIENT_ID"),
    date: { ...timestampTz("LOG_DATE"), createDate: true },
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    patient: {
      type: "many-to-one",
      target: "Patient",
      inverseSide: "workoutLogs",
      joinColumn: { name: "PATIENT_ID" },
      onDelete: "CASCADE",
    },
  },
});
