import { EntitySchema } from "typeorm";
import { timestampTz, uuidPrimary, uuidRef, varchar } from "./columns";
import type { Patient } from "./patient";

export type StatusPacoteAcompanhamento =
  | "ATIVO"
  | "CONCLUIDO"
  | "RENOVADO"
  | "CANCELADO";

export type TipoConsultaPacote =
  | "PRESENCIAL"
  | "ONLINE"
  | "RETORNO"
  | "AVALIACAO";

export type StatusConsultaPacote =
  | "REALIZADA"
  | "FALTA_COBRADA"
  | "BONIFICADA";

// ============================================================================
// 26. PACOTES_ACOMPANHAMENTO (Controle de Pacotes do Plano FAAZ)
// ============================================================================
export interface PacoteAcompanhamento {
  id: string;
  pacienteId: string;
  nomePlano: string;
  qtdTotalConsultas: number;
  dataInicio: string; // YYYY-MM-DD (America/Sao_Paulo)
  dataValidade: string | null; // YYYY-MM-DD (America/Sao_Paulo)
  status: StatusPacoteAcompanhamento;
  observacoes: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;

  patient?: Patient;
  consultas?: ConsultaPacote[];
}

export const PacoteAcompanhamentoEntity =
  new EntitySchema<PacoteAcompanhamento>({
    name: "PacoteAcompanhamento",
    tableName: "PACOTES_ACOMPANHAMENTO",
    columns: {
      id: uuidPrimary,
      pacienteId: uuidRef("PACIENTE_ID"),
      nomePlano: varchar("NOME_PLANO", 120),
      qtdTotalConsultas: {
        name: "QTD_TOTAL_CONSULTAS",
        type: "number",
        precision: 4,
        scale: 0,
        nullable: false,
      },
      dataInicio: varchar("DATA_INICIO", 10),
      dataValidade: varchar("DATA_VALIDADE", 10, true),
      status: { ...varchar("STATUS", 20), default: "ATIVO" },
      observacoes: varchar("OBSERVACOES", 500, true),
      createdBy: varchar("CREATED_BY", 120, true),
      createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
      updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
    },
    relations: {
      patient: {
        type: "many-to-one",
        target: "Patient",
        joinColumn: { name: "PACIENTE_ID" },
        onDelete: "CASCADE",
      },
      consultas: {
        type: "one-to-many",
        target: "ConsultaPacote",
        inverseSide: "pacote",
      },
    },
  });

// ============================================================================
// 27. CONSULTAS_PACOTE (Extrato de Consultas Vinculadas ao Pacote)
// ============================================================================
export interface ConsultaPacote {
  id: string;
  pacoteId: string;
  pacienteId: string;
  dataConsulta: string; // YYYY-MM-DD (America/Sao_Paulo)
  horaConsulta: string | null; // HH:MM
  tipo: TipoConsultaPacote;
  status: StatusConsultaPacote;
  profissionalNome: string | null;
  evolucaoId: string | null;
  observacao: string | null;
  createdAt: Date;

  pacote?: PacoteAcompanhamento;
  patient?: Patient;
}

export const ConsultaPacoteEntity = new EntitySchema<ConsultaPacote>({
  name: "ConsultaPacote",
  tableName: "CONSULTAS_PACOTE",
  columns: {
    id: uuidPrimary,
    pacoteId: uuidRef("PACOTE_ID"),
    pacienteId: uuidRef("PACIENTE_ID"),
    dataConsulta: varchar("DATA_CONSULTA", 10),
    horaConsulta: varchar("HORA_CONSULTA", 5, true),
    tipo: { ...varchar("TIPO", 30), default: "PRESENCIAL" },
    status: { ...varchar("STATUS", 20), default: "REALIZADA" },
    profissionalNome: varchar("PROFISSIONAL_NOME", 120, true),
    evolucaoId: uuidRef("EVOLUCAO_ID", true),
    observacao: varchar("OBSERVACAO", 400, true),
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
  },
  relations: {
    pacote: {
      type: "many-to-one",
      target: "PacoteAcompanhamento",
      inverseSide: "consultas",
      joinColumn: { name: "PACOTE_ID" },
      onDelete: "CASCADE",
    },
    patient: {
      type: "many-to-one",
      target: "Patient",
      joinColumn: { name: "PACIENTE_ID" },
      onDelete: "CASCADE",
    },
  },
});
