/**
 * Tipos compartilhados e cálculos determinísticos para o módulo
 * Controle de Pacotes e Consultas (Plano FAAZ).
 */

import type {
  StatusConsultaPacote,
  StatusPacoteAcompanhamento,
  TipoConsultaPacote,
} from "@/lib/db/entities/packages";

export type {
  StatusConsultaPacote,
  StatusPacoteAcompanhamento,
  TipoConsultaPacote,
};

export interface ConsultaPacoteDTO {
  id: string;
  pacoteId: string;
  pacienteId: string;
  numeroSequencial: number;
  descontaSaldo: boolean;
  dataConsulta: string; // YYYY-MM-DD
  horaConsulta: string | null; // HH:MM
  tipo: TipoConsultaPacote;
  status: StatusConsultaPacote;
  profissionalNome: string | null;
  evolucaoId: string | null;
  observacao: string | null;
  createdAt: string;
}

export interface PacoteResumoDTO {
  id: string;
  pacienteId: string;
  nomePlano: string;
  qtdTotalConsultas: number;
  dataInicio: string; // YYYY-MM-DD
  dataValidade: string | null; // YYYY-MM-DD
  status: StatusPacoteAcompanhamento;
  observacoes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  consultasRealizadas: number; // REALIZADA + FALTA_COBRADA (BONIFICADA não desconta)
  consultasBonificadas: number;
  consultasRestantes: number;
  percentualUso: number;
  diasParaVencer: number | null;
  vencido: boolean;
  alertaRenovacao: boolean;
  motivoAlerta: string | null;
  consultas: ConsultaPacoteDTO[];
}

export interface PacoteAtivoResumoListaDTO {
  id: string;
  nomePlano: string;
  qtdTotalConsultas: number;
  consultasRealizadas: number;
  consultasRestantes: number;
  dataInicio: string; // YYYY-MM-DD
  dataValidade: string | null; // YYYY-MM-DD
  status: StatusPacoteAcompanhamento;
  diasParaVencer: number | null;
  vencido: boolean;
  alertaRenovacao: boolean;
}

export interface PacotesPacienteResponse {
  success: boolean;
  membroPlanoFaaz: boolean;
  pacoteAtivo: PacoteResumoDTO | null;
  ultimoPacoteConcluido: PacoteResumoDTO | null;
  historicoPacotes: PacoteResumoDTO[];
}

/**
 * Diferença em dias inteiros entre duas datas YYYY-MM-DD (`destino - origem`).
 */
export function diffDiasIso(origemIso: string, destinoIso: string): number {
  const [oy, om, od] = origemIso.slice(0, 10).split("-").map(Number);
  const [dy, dm, dd] = destinoIso.slice(0, 10).split("-").map(Number);
  const utcOrigem = Date.UTC(oy, (om || 1) - 1, od || 1);
  const utcDestino = Date.UTC(dy, (dm || 1) - 1, dd || 1);
  return Math.round((utcDestino - utcOrigem) / (24 * 60 * 60 * 1000));
}

export function formatIsoDateBr(iso?: string | null): string {
  if (!iso) return "--";
  const clean = iso.trim().slice(0, 10);
  const parts = clean.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function consultaDescontaSaldo(status: StatusConsultaPacote): boolean {
  return status !== "BONIFICADA";
}

export function labelTipoConsulta(tipo: TipoConsultaPacote): string {
  switch (tipo) {
    case "ONLINE":
      return "Online";
    case "RETORNO":
      return "Retorno";
    case "AVALIACAO":
      return "Avaliação";
    default:
      return "Presencial";
  }
}

export function labelStatusConsulta(status: StatusConsultaPacote): string {
  switch (status) {
    case "FALTA_COBRADA":
      return "Falta cobrada";
    case "BONIFICADA":
      return "Bonificada (Cortesia)";
    default:
      return "Realizada";
  }
}

export function labelStatusPacote(status: StatusPacoteAcompanhamento): string {
  switch (status) {
    case "CONCLUIDO":
      return "Concluído";
    case "RENOVADO":
      return "Renovado";
    case "CANCELADO":
      return "Cancelado";
    default:
      return "Ativo";
  }
}
