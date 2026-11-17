import {
  AgendamentoEntity,
  BiometricMeasurementEntity,
  DocumentTemplateEntity,
  EvolucaoClinicaEntity,
  GoalCheckinEntity,
  MeasurementEntity,
  MedicoEntity,
  PatientGoalEntity,
  ProntuarioPacienteEntity,
  RegistroGlicemiaEntity,
} from "./clinical";
import {
  CheckinHidratacaoEntity,
  CheckinIntestinalEntity,
  CheckInSonoEntity,
  FoodEntity,
  WorkoutLogEntity,
} from "./habits";
import {
  AlimentoEntity,
  DietSubstitutionEntity,
  ItemRefeicaoEntity,
  PlanoAlimentarEntity,
  RefeicaoEntity,
  VariacaoDietaEntity,
} from "./nutrition";
import { OrganizationEntity } from "./organization";
import { PatientEntity } from "./patient";
import { UserEntity } from "./user";

export * from "./enums";
export type {
  Agendamento,
  BiometricMeasurement,
  DocumentTemplate,
  EvolucaoClinica,
  GoalCheckin,
  Measurement,
  Medico,
  PatientGoal,
  ProntuarioPaciente,
  RegistroGlicemia,
} from "./clinical";
export type {
  CheckinHidratacao,
  CheckinIntestinal,
  CheckInSono,
  Food,
  WorkoutLog,
} from "./habits";
export type {
  Alimento,
  DietSubstitution,
  ItemRefeicao,
  PlanoAlimentar,
  Refeicao,
  VariacaoDieta,
} from "./nutrition";
export type { Organization } from "./organization";
export type { Patient } from "./patient";
export type { User } from "./user";

export {
  AgendamentoEntity,
  AlimentoEntity,
  BiometricMeasurementEntity,
  CheckinHidratacaoEntity,
  CheckinIntestinalEntity,
  CheckInSonoEntity,
  DietSubstitutionEntity,
  DocumentTemplateEntity,
  EvolucaoClinicaEntity,
  FoodEntity,
  GoalCheckinEntity,
  ItemRefeicaoEntity,
  MeasurementEntity,
  MedicoEntity,
  OrganizationEntity,
  PatientEntity,
  PatientGoalEntity,
  PlanoAlimentarEntity,
  ProntuarioPacienteEntity,
  RefeicaoEntity,
  RegistroGlicemiaEntity,
  UserEntity,
  VariacaoDietaEntity,
  WorkoutLogEntity,
};

/**
 * Todas as entidades registradas no DataSource (Lotes 1 a 4).
 */
export const entities = [
  OrganizationEntity,
  UserEntity,
  PatientEntity,
  ProntuarioPacienteEntity,
  EvolucaoClinicaEntity,
  BiometricMeasurementEntity,
  MeasurementEntity,
  MedicoEntity,
  AgendamentoEntity,
  DocumentTemplateEntity,
  RegistroGlicemiaEntity,
  PatientGoalEntity,
  GoalCheckinEntity,
  AlimentoEntity,
  PlanoAlimentarEntity,
  VariacaoDietaEntity,
  RefeicaoEntity,
  ItemRefeicaoEntity,
  DietSubstitutionEntity,
  FoodEntity,
  CheckinIntestinalEntity,
  CheckinHidratacaoEntity,
  CheckInSonoEntity,
  WorkoutLogEntity,
];
