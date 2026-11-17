import { EntitySchema } from "typeorm";
import {
  auditColumns,
  bool,
  clob,
  decimal,
  emptyStringAsNull,
  integer,
  json,
  uuidPrimary,
  uuidRef,
  varchar,
  type AuditFields,
} from "./columns";
import type { BiologicalSex, PatientStatus } from "./enums";
import type {
  Agendamento,
  BiometricMeasurement,
  EvolucaoClinica,
  GoalCheckin,
  Measurement,
  PatientGoal,
  ProntuarioPaciente,
  RegistroGlicemia,
} from "./clinical";
import type { DietSubstitution, PlanoAlimentar } from "./nutrition";
import type { CheckInSono, WorkoutLog } from "./habits";
import type { Organization } from "./organization";
import type { User } from "./user";

// 3. PATIENTS (Cadastro Clínico e Demográfico de Pacientes)
export interface Patient extends AuditFields {
  id: string;
  organizationId: string;
  userId: string | null;
  recordCode: string;
  fullName: string;
  socialName: string | null;
  cpf: string | null;
  rg: string | null;
  /** DATE do Oracle hidratado como 'YYYY-MM-DD' (sem deslocamento de fuso). */
  birthDate: string | null;
  biologicalSex: BiologicalSex | null;
  estadoCivil: string | null;
  profissao: string | null;
  convenio: string;
  planoFaaz: boolean;
  /** NUMBER(5,2) — chega como number (no Prisma era Decimal). */
  heightCm: number | null;
  /** '' no código ↔ NULL no Oracle (ver emptyStringAsNull). */
  phoneWhatsapp: string;
  telefoneSecundario: string | null;
  email: string | null;
  contatoEmergenciaNome: string | null;
  contatoEmergenciaTelefone: string | null;
  photoUrl: string | null;
  avatarUrl: string | null;
  clinicalFocus: string | null;
  treatmentObjective: string | null;

  // Diretrizes de Atividade Física / Treinos (Habit Tracker)
  workoutType: string | null;
  workoutFrequency: number | null;
  workoutDuration: number | null;
  workoutRestrictions: string | null;

  // Endereço Residencial (ViaCEP)
  zipCode: string | null;
  street: string | null;
  /** Coluna ADDRESS_NUMBER: NUMBER é palavra reservada no Oracle. */
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;

  primaryDoctorId: string | null;
  primaryNutritionistId: string | null;
  metaDiariaMl: number;
  patientStatus: PatientStatus;
  /** Era String[] no PostgreSQL; agora array JSON em CLOB. */
  activeModules: string[];

  organization?: Organization;
  user?: User | null;
  primaryDoctor?: User | null;
  primaryNutritionist?: User | null;
  prontuario?: ProntuarioPaciente | null;
  evolucoesClinicas?: EvolucaoClinica[];
  biometricMeasurements?: BiometricMeasurement[];
  measurements?: Measurement[];
  registrosGlicemia?: RegistroGlicemia[];
  agendamentos?: Agendamento[];
  patientGoals?: PatientGoal[];
  goalCheckins?: GoalCheckin[];
  planosAlimentares?: PlanoAlimentar[];
  dietSubstitutions?: DietSubstitution[];
  checkinsSono?: CheckInSono[];
  workoutLogs?: WorkoutLog[];
}

export const PatientEntity = new EntitySchema<Patient>({
  name: "Patient",
  tableName: "PATIENTS",
  columns: {
    id: uuidPrimary,
    organizationId: uuidRef("ORGANIZATION_ID"),
    userId: uuidRef("USER_ID", true),
    recordCode: varchar("RECORD_CODE", 40),
    fullName: varchar("FULL_NAME", 160),
    socialName: varchar("SOCIAL_NAME", 160, true),
    cpf: varchar("CPF", 14, true),
    rg: varchar("RG", 20, true),
    birthDate: { name: "BIRTH_DATE", type: "date", nullable: true },
    biologicalSex: varchar("BIOLOGICAL_SEX", 10, true),
    estadoCivil: varchar("ESTADO_CIVIL", 30, true),
    profissao: varchar("PROFISSAO", 100, true),
    convenio: { ...varchar("CONVENIO", 50), default: "Particular" },
    planoFaaz: { ...bool("PLANO_FAAZ"), default: false },
    heightCm: decimal("HEIGHT_CM", 5, 2, true),
    phoneWhatsapp: { ...varchar("PHONE_WHATSAPP", 30, true), transformer: emptyStringAsNull },
    telefoneSecundario: varchar("TELEFONE_SECUNDARIO", 30, true),
    email: varchar("EMAIL", 160, true),
    contatoEmergenciaNome: varchar("CONTATO_EMERGENCIA_NOME", 160, true),
    contatoEmergenciaTelefone: varchar("CONTATO_EMERGENCIA_TELEFONE", 30, true),
    photoUrl: clob("PHOTO_URL"),
    avatarUrl: clob("AVATAR_URL"),
    clinicalFocus: varchar("CLINICAL_FOCUS", 200, true),
    treatmentObjective: varchar("TREATMENT_OBJECTIVE", 200, true),
    workoutType: varchar("WORKOUT_TYPE", 100, true),
    workoutFrequency: integer("WORKOUT_FREQUENCY", true),
    workoutDuration: integer("WORKOUT_DURATION", true),
    workoutRestrictions: clob("WORKOUT_RESTRICTIONS"),
    zipCode: varchar("ZIP_CODE", 10, true),
    street: varchar("STREET", 200, true),
    number: varchar("ADDRESS_NUMBER", 30, true),
    complement: varchar("COMPLEMENT", 100, true),
    neighborhood: varchar("NEIGHBORHOOD", 100, true),
    city: varchar("CITY", 100, true),
    state: varchar("STATE", 2, true),
    primaryDoctorId: uuidRef("PRIMARY_DOCTOR_ID", true),
    primaryNutritionistId: uuidRef("PRIMARY_NUTRITIONIST_ID", true),
    metaDiariaMl: { ...integer("META_DIARIA_ML"), default: 2500 },
    patientStatus: { ...varchar("PATIENT_STATUS", 20), default: "ACTIVE" },
    activeModules: json("ACTIVE_MODULES"),
    ...auditColumns,
  },
  relations: {
    organization: {
      type: "many-to-one",
      target: "Organization",
      inverseSide: "patients",
      joinColumn: { name: "ORGANIZATION_ID" },
    },
    user: {
      type: "one-to-one",
      target: "User",
      inverseSide: "patientAccount",
      joinColumn: { name: "USER_ID" },
      nullable: true,
    },
    primaryDoctor: {
      type: "many-to-one",
      target: "User",
      inverseSide: "primaryDoctorPatients",
      joinColumn: { name: "PRIMARY_DOCTOR_ID" },
      nullable: true,
    },
    primaryNutritionist: {
      type: "many-to-one",
      target: "User",
      inverseSide: "primaryNutritionistPatients",
      joinColumn: { name: "PRIMARY_NUTRITIONIST_ID" },
      nullable: true,
    },
    prontuario: {
      type: "one-to-one",
      target: "ProntuarioPaciente",
      inverseSide: "patient",
    },
    evolucoesClinicas: {
      type: "one-to-many",
      target: "EvolucaoClinica",
      inverseSide: "patient",
    },
    biometricMeasurements: {
      type: "one-to-many",
      target: "BiometricMeasurement",
      inverseSide: "patient",
    },
    measurements: {
      type: "one-to-many",
      target: "Measurement",
      inverseSide: "patient",
    },
    registrosGlicemia: {
      type: "one-to-many",
      target: "RegistroGlicemia",
      inverseSide: "paciente",
    },
    agendamentos: {
      type: "one-to-many",
      target: "Agendamento",
      inverseSide: "paciente",
    },
    patientGoals: {
      type: "one-to-many",
      target: "PatientGoal",
      inverseSide: "patient",
    },
    goalCheckins: {
      type: "one-to-many",
      target: "GoalCheckin",
      inverseSide: "patient",
    },
    planosAlimentares: {
      type: "one-to-many",
      target: "PlanoAlimentar",
      inverseSide: "paciente",
    },
    dietSubstitutions: {
      type: "one-to-many",
      target: "DietSubstitution",
      inverseSide: "patient",
    },
    checkinsSono: {
      type: "one-to-many",
      target: "CheckInSono",
      inverseSide: "paciente",
    },
    workoutLogs: {
      type: "one-to-many",
      target: "WorkoutLog",
      inverseSide: "patient",
    },
  },
});
