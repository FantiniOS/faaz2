import { EntitySchema } from "typeorm";
import {
  bool,
  integer,
  timestampTz,
  uuidPrimary,
  varchar,
} from "./columns";

// ============================================================================
// ESPECIALIDADES (Áreas de Atendimento Configuráveis da Clínica — FRdoc 2.0)
// ============================================================================
export interface Especialidade {
  id: string;
  nome: string;
  cor: string;
  ativo: boolean;
  ordem: number;
  createdAt: Date;
  updatedAt: Date;
}

export const EspecialidadeEntity = new EntitySchema<Especialidade>({
  name: "Especialidade",
  tableName: "ESPECIALIDADES",
  columns: {
    id: uuidPrimary,
    nome: varchar("NOME", 100),
    cor: { ...varchar("COR", 20), default: "emerald" },
    ativo: { ...bool("ATIVO"), default: true },
    ordem: { ...integer("ORDEM"), default: 0 },
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
});
