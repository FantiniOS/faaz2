import { EntitySchema } from "typeorm";
import { auditColumns, json, uuidPrimary, varchar, type AuditFields } from "./columns";
import type { OrganizationStatus } from "./enums";
import type { Patient } from "./patient";
import type { User } from "./user";

// 1. ORGANIZATIONS (Clínica / Unidade Contratante)
export interface Organization extends AuditFields {
  id: string;
  slug: string;
  legalName: string;
  tradeName: string;
  taxId: string;
  primaryColorHex: string;
  logoStorageKey: string | null;
  enabledModules: Record<string, unknown>;
  rolePermissions: Record<string, unknown> | null;
  status: OrganizationStatus;

  users?: User[];
  patients?: Patient[];
}

export const OrganizationEntity = new EntitySchema<Organization>({
  name: "Organization",
  tableName: "ORGANIZATIONS",
  columns: {
    id: uuidPrimary,
    slug: varchar("SLUG", 80),
    legalName: varchar("LEGAL_NAME", 200),
    tradeName: varchar("TRADE_NAME", 150),
    taxId: varchar("TAX_ID", 20),
    primaryColorHex: { ...varchar("PRIMARY_COLOR_HEX", 7), default: "#059669" },
    logoStorageKey: varchar("LOGO_STORAGE_KEY", 255, true),
    enabledModules: json("ENABLED_MODULES"),
    rolePermissions: json("ROLE_PERMISSIONS", true),
    status: { ...varchar("STATUS", 20), default: "ACTIVE" },
    ...auditColumns,
  },
  relations: {
    users: { type: "one-to-many", target: "User", inverseSide: "organization" },
    patients: { type: "one-to-many", target: "Patient", inverseSide: "organization" },
  },
});
