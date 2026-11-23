/**
 * Tipos compartilhados e cálculos determinísticos para o módulo
 * Controle de Pacotes e Consultas (Plano FAAZ).
 */

import type {
  StatusConsultaPacote,
  StatusPacoteAcompanhamento,
  TipoConsultaPacote,
} from "@/lib/db/entities/packages";
import { getDataDiaBR } from "@/lib/date-br";

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

export type PacoteSemaforoTone = "neutral" | "red" | "amber" | "green";

export interface PacoteVisualStatusInput {
  realizadas: number;
  total: number;
  validade?: string | null; // YYYY-MM-DD
  status?: StatusPacoteAcompanhamento | string | null;
  /** Opcional: data atual YYYY-MM-DD em America/Sao_Paulo para testes/cálculo determinístico */
  hojeIso?: string;
}

export interface PacoteVisualStatusResult {
  tone: PacoteSemaforoTone;
  restantes: number;
  diasParaVencer: number | null;
  vencido: boolean;
  esgotado: boolean;
  alertaAtencao: boolean;
  pillClass: string;
  pillHoverClass: string;
  interactivePillClass: string;
  progressBarClass: string;
  dotClass: string;
  alertBoxClass: string;
  shortLabel: string;
  tooltip: string;
  motivoAlerta: string | null;
}

/**
 * Helper único de semáforo visual para pílulas, badges e barras de progresso
 * de Programas / Pacotes de Consultas (Plano FAAZ).
 *
 * Regras (fuso America/Sao_Paulo):
 * - Cinza neutro: sem pacote ativo (`null`) ou pacote cancelado/renovado/inativo
 * - Vermelho: esgotado (`restantes <= 0` ou `CONCLUIDO`) ou vencido (`validade < hoje`)
 * - Âmbar: última consulta (`restantes === 1`), ou pacote grande acabando (`total >= 8 && restantes <= 2`), ou validade em até 30 dias
 * - Verde: dentro da validade com saldo saudável
 */
export function getPacoteVisualStatus(
  input: PacoteVisualStatusInput | null | undefined,
): PacoteVisualStatusResult {
  const neutralBase = (
    shortLabel: string,
    tooltip: string,
  ): PacoteVisualStatusResult => ({
    tone: "neutral",
    restantes: 0,
    diasParaVencer: null,
    vencido: false,
    esgotado: false,
    alertaAtencao: false,
    pillClass: "bg-slate-100 text-slate-600 border-slate-200",
    pillHoverClass: "hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300",
    interactivePillClass:
      "bg-slate-100 text-slate-600 border-slate-200 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300",
    progressBarClass: "bg-slate-300",
    dotClass: "bg-slate-400",
    alertBoxClass: "bg-slate-50 text-slate-700 border-slate-200",
    shortLabel,
    tooltip,
    motivoAlerta: null,
  });

  if (!input) {
    return neutralBase(
      "Avulso",
      "Sem pacote ativo (avulso) — clique para configurar o programa/pacote",
    );
  }

  const statusUpper =
    typeof input.status === "string"
      ? input.status.trim().toUpperCase()
      : "ATIVO";

  if (statusUpper === "CANCELADO") {
    return neutralBase("Cancelado", "Pacote cancelado — clique para configurar");
  }
  if (statusUpper === "RENOVADO") {
    return neutralBase("Renovado", "Ciclo renovado");
  }

  const total = Math.max(0, Number(input.total) || 0);
  const realizadas = Math.max(0, Number(input.realizadas) || 0);
  const restantes = Math.max(0, total - realizadas);

  if (statusUpper !== "ATIVO" && statusUpper !== "CONCLUIDO" && restantes <= 0) {
    return neutralBase(
      "Avulso",
      "Sem pacote ativo — clique para configurar o programa/pacote",
    );
  }

  const hoje = input.hojeIso || getDataDiaBR();
  const validadeLimpa =
    typeof input.validade === "string" && input.validade.trim()
      ? input.validade.trim().slice(0, 10)
      : null;
  const diasParaVencer = validadeLimpa ? diffDiasIso(hoje, validadeLimpa) : null;
  const vencido = diasParaVencer !== null && diasParaVencer < 0;
  const esgotado =
    total <= 0 || restantes <= 0 || statusUpper === "CONCLUIDO";

  // 1. VERMELHO — Esgotado ou Vencido
  if (esgotado || vencido) {
    let shortLabel = "Esgotado";
    let tooltip = "Pacote esgotado — renovar";
    let motivoAlerta = "Pacote esgotado — renovar";

    if (esgotado && vencido) {
      shortLabel = "Esgotado · Vencido";
      tooltip = "Pacote esgotado e vencido — renovar";
      motivoAlerta = "Pacote esgotado e vencido — renovar";
    } else if (vencido) {
      const diasAtraso = Math.abs(diasParaVencer ?? 0);
      shortLabel = "Vencido";
      tooltip =
        diasAtraso === 1
          ? "Pacote vencido há 1 dia — renovar"
          : `Pacote vencido há ${diasAtraso} dias — renovar`;
      motivoAlerta = tooltip;
    }

    return {
      tone: "red",
      restantes,
      diasParaVencer,
      vencido,
      esgotado,
      alertaAtencao: true,
      pillClass: "bg-red-50 text-red-700 border-red-200",
      pillHoverClass: "hover:bg-red-100 hover:border-red-300",
      interactivePillClass:
        "bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:border-red-300",
      progressBarClass: "bg-red-500",
      dotClass: "bg-red-500",
      alertBoxClass: "bg-red-50/90 text-red-800 border-red-200",
      shortLabel,
      tooltip,
      motivoAlerta,
    };
  }

  // 2. ÂMBAR — Última consulta, pacote grande acabando (total >= 8 && restantes <= 2), ou vence em até 30 dias
  const ultimaConsulta = restantes === 1;
  const pacoteGrandeAcabando = total >= 8 && restantes <= 2;
  const validadeProxima = diasParaVencer !== null && diasParaVencer <= 30;

  if (ultimaConsulta || pacoteGrandeAcabando || validadeProxima) {
    const partesMotivo: string[] = [];
    let shortLabel = "Renovar em breve";

    if (ultimaConsulta) {
      partesMotivo.push("Atenção: última consulta do pacote");
      shortLabel = "Última consulta";
    } else if (pacoteGrandeAcabando) {
      partesMotivo.push(
        `Atenção: restam apenas ${restantes} consultas no pacote`,
      );
      shortLabel = `Faltam ${restantes}`;
    }

    if (validadeProxima && diasParaVencer !== null) {
      const msgValidade =
        diasParaVencer === 0
          ? "Validade vence hoje"
          : diasParaVencer === 1
            ? "Validade vence amanhã (1 dia)"
            : `Validade vence em ${diasParaVencer} dias`;
      partesMotivo.push(msgValidade);
      if (!ultimaConsulta && !pacoteGrandeAcabando) {
        shortLabel =
          diasParaVencer === 0
            ? "Vence hoje"
            : `Vence em ${diasParaVencer}d`;
      }
    }

    const motivo = partesMotivo.join(" • ");

    return {
      tone: "amber",
      restantes,
      diasParaVencer,
      vencido: false,
      esgotado: false,
      alertaAtencao: true,
      pillClass: "bg-amber-50 text-amber-800 border-amber-300",
      pillHoverClass: "hover:bg-amber-100 hover:border-amber-400",
      interactivePillClass:
        "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 hover:border-amber-400",
      progressBarClass: "bg-amber-500",
      dotClass: "bg-amber-500",
      alertBoxClass: "bg-amber-50/90 text-amber-900 border-amber-300",
      shortLabel,
      tooltip: motivo,
      motivoAlerta: motivo,
    };
  }

  // 3. VERDE — Saldo saudável dentro da validade
  const validadeTexto = validadeLimpa
    ? ` • Validade ${formatIsoDateBr(validadeLimpa)}`
    : "";
  const tooltipSaudavel = `${realizadas} de ${total} realizadas • Faltam ${restantes}${validadeTexto}`;

  return {
    tone: "green",
    restantes,
    diasParaVencer,
    vencido: false,
    esgotado: false,
    alertaAtencao: false,
    pillClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pillHoverClass: "hover:bg-emerald-100 hover:border-emerald-300",
    interactivePillClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300",
    progressBarClass: "bg-emerald-500",
    dotClass: "bg-emerald-500",
    alertBoxClass: "bg-emerald-50/90 text-emerald-800 border-emerald-200",
    shortLabel: "Ciclo Ativo",
    tooltip: tooltipSaudavel,
    motivoAlerta: null,
  };
}
