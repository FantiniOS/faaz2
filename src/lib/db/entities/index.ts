import {
  AgendamentoEntity,
  BiometricMeasurementEntity,
  DocumentTemplateEntity,
  EvolucaoClinicaEntity,
  ExameLaboratorialEntity,
  GoalCheckinEntity,
  MeasurementEntity,
  MedicoEntity,
  PatientGoalEntity,
  ProntuarioPacienteEntity,
  ProtocoloGlicemicoEntity,
  RegistroGlicemiaEntity,
  RegistroInsulinaEntity,
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
  CheckinRefeicaoEntity,
  DietSubstitutionEntity,
  ItemRefeicaoEntity,
  ModeloDietaEntity,
  PlanoAlimentarEntity,
  RefeicaoEntity,
  SubstituicaoItemRefeicaoEntity,
  VariacaoDietaEntity,
} from "./nutrition";
import { OrganizationEntity } from "./organization";
import {
  ConsultaPacoteEntity,
  PacoteAcompanhamentoEntity,
} from "./packages";
import { PatientEntity } from "./patient";
import { EspecialidadeEntity } from "./specialty";
import { UserEntity } from "./user";

export * from "./enums";
export type {
  Agendamento,
  BiometricMeasurement,
  DocumentTemplate,
  EvolucaoClinica,
  ExameLaboratorial,
  ExamePersonalizadoItem,
  GoalCheckin,
  Measurement,
  Medico,
  PatientGoal,
  ProntuarioPaciente,
  ProtocoloGlicemico,
  RegistroGlicemia,
  RegistroInsulina,
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
  CheckinRefeicao,
  DietSubstitution,
  ItemRefeicao,
  ModeloDieta,
  PlanoAlimentar,
  Refeicao,
  StatusCheckinRefeicao,
  SubstituicaoItemRefeicao,
  UnidadeMedidaDieta,
  VariacaoDieta,
} from "./nutrition";
export type { Organization } from "./organization";
export type {
  ConsultaPacote,
  PacoteAcompanhamento,
  StatusConsultaPacote,
  StatusPacoteAcompanhamento,
  TipoConsultaPacote,
} from "./packages";
export type { Patient } from "./patient";
export type { Especialidade } from "./specialty";
export type { User } from "./user";

export {
  AgendamentoEntity,
  AlimentoEntity,
  BiometricMeasurementEntity,
  CheckinHidratacaoEntity,
  CheckinIntestinalEntity,
  CheckinRefeicaoEntity,
  CheckInSonoEntity,
  ConsultaPacoteEntity,
  DietSubstitutionEntity,
  DocumentTemplateEntity,
  EspecialidadeEntity,
  EvolucaoClinicaEntity,
  ExameLaboratorialEntity,
  FoodEntity,
  GoalCheckinEntity,
  ItemRefeicaoEntity,
  MeasurementEntity,
  MedicoEntity,
  ModeloDietaEntity,
  OrganizationEntity,
  PacoteAcompanhamentoEntity,
  PatientEntity,
  PatientGoalEntity,
  PlanoAlimentarEntity,
  ProntuarioPacienteEntity,
  ProtocoloGlicemicoEntity,
  RefeicaoEntity,
  RegistroGlicemiaEntity,
  RegistroInsulinaEntity,
  SubstituicaoItemRefeicaoEntity,
  UserEntity,
  VariacaoDietaEntity,
  WorkoutLogEntity,
};

/**
 * Todas as entidades registradas no DataSource (Lotes 1 a 8).
 */
export const entities = [
  OrganizationEntity,
  EspecialidadeEntity,
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
  ProtocoloGlicemicoEntity,
  RegistroInsulinaEntity,
  ExameLaboratorialEntity,
  PatientGoalEntity,
  GoalCheckinEntity,
  AlimentoEntity,
  PlanoAlimentarEntity,
  VariacaoDietaEntity,
  RefeicaoEntity,
  ItemRefeicaoEntity,
  SubstituicaoItemRefeicaoEntity,
  DietSubstitutionEntity,
  CheckinRefeicaoEntity,
  ModeloDietaEntity,
  FoodEntity,
  CheckinIntestinalEntity,
  CheckinHidratacaoEntity,
  CheckInSonoEntity,
  WorkoutLogEntity,
  PacoteAcompanhamentoEntity,
  ConsultaPacoteEntity,
];
