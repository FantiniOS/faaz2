import { EntitySchema } from "typeorm";
import {
  auditColumns,
  bool,
  clob,
  timestampTz,
  uuidPrimary,
  uuidRef,
  varchar,
  type AuditFields,
} from "./columns";
import type { AccountStatus, Cargo, UserRole } from "./enums";
import type { Organization } from "./organization";
import type { Patient } from "./patient";
import type { Especialidade } from "./specialty";

// 2. USERS (Profissionais, Administradores, Equipe e Conta Paciente)
export interface User extends AuditFields {
  id: string;
  organizationId: string;
  title: string | null;
  fullName: string;
  username: string;
  email: string | null;
  passwordHash: string;
  role: UserRole;
  cargo: Cargo;
  podeAcessarProntuario: boolean;
  councilType: string | null;
  councilNumber: string | null;
  specialty: string | null;
  especialidadeId: string | null;
  roomNumber: string | null;
  isClinical: boolean;
  mfaEnabled: boolean;
  mfaSecretEncrypted: string | null;
  accountStatus: AccountStatus;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;

  organization?: Organization;
  especialidade?: Especialidade | null;
  patientAccount?: Patient | null;
  primaryDoctorPatients?: Patient[];
  primaryNutritionistPatients?: Patient[];
}

export const UserEntity = new EntitySchema<User>({
  name: "User",
  tableName: "USERS",
  columns: {
    id: uuidPrimary,
    organizationId: uuidRef("ORGANIZATION_ID"),
    title: varchar("TITLE", 20, true),
    fullName: varchar("FULL_NAME", 160),
    username: varchar("USERNAME", 60),
    email: varchar("EMAIL", 160, true),
    passwordHash: varchar("PASSWORD_HASH", 255),
    role: varchar("ROLE", 20),
    cargo: { ...varchar("CARGO", 20), default: "DONO_CLINICA" },
    podeAcessarProntuario: { ...bool("PODE_ACESSAR_PRONTUARIO"), default: true },
    councilType: varchar("COUNCIL_TYPE", 20, true),
    councilNumber: varchar("COUNCIL_NUMBER", 40, true),
    specialty: varchar("SPECIALTY", 100, true),
    especialidadeId: uuidRef("ESPECIALIDADE_ID", true),
    roomNumber: varchar("ROOM_NUMBER", 50, true),
    isClinical: { ...bool("IS_CLINICAL"), default: false },
    mfaEnabled: { ...bool("MFA_ENABLED"), default: false },
    mfaSecretEncrypted: clob("MFA_SECRET_ENCRYPTED"),
    accountStatus: { ...varchar("ACCOUNT_STATUS", 20), default: "ACTIVE" },
    mustChangePassword: { ...bool("MUST_CHANGE_PASSWORD"), default: true },
    lastLoginAt: timestampTz("LAST_LOGIN_AT", true),
    ...auditColumns,
  },
  relations: {
    organization: {
      type: "many-to-one",
      target: "Organization",
      inverseSide: "users",
      joinColumn: { name: "ORGANIZATION_ID" },
    },
    especialidade: {
      type: "many-to-one",
      target: "Especialidade",
      joinColumn: { name: "ESPECIALIDADE_ID" },
    },
    patientAccount: { type: "one-to-one", target: "Patient", inverseSide: "user" },
    primaryDoctorPatients: {
      type: "one-to-many",
      target: "Patient",
      inverseSide: "primaryDoctor",
    },
    primaryNutritionistPatients: {
      type: "one-to-many",
      target: "Patient",
      inverseSide: "primaryNutritionist",
    },
  },
});
