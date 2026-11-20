/**
 * Utilitário compartilhado de classificação e semântica do Objetivo Clínico (Web & API).
 * Espelha integralmente o comportamento validado no App Mobile
 * (`HIPERTROFIA` | `EMAGRECIMENTO` | `MANUTENCAO`), garantindo linguagem,
 * cores, badges e metas 100% coerentes com a diretriz médica do paciente.
 */

import { CLINICAL_OBJECTIVES } from "@/lib/clinical-objectives";

export type PerfilObjetivo = "HIPERTROFIA" | "EMAGRECIMENTO" | "MANUTENCAO";

export interface ConfigObjetivoClinico {
  perfil: PerfilObjetivo;
  rotuloCurto: string;
  subtituloPeso: string;
  subtituloDiretriz: string;
  badgeClass: string;
  accentTextClass: string;
}

export interface AvaliacaoVariacaoPeso {
  tom: "positivo" | "atencao" | "neutro";
  direcao: "up" | "down" | "flat";
  sinalTexto: string;
  rotulo: string;
  textClass: string;
  badgeClass: string;
}

export interface AvaliacaoDistanciaAlvo {
  label: string;
  atingida: boolean;
  badgeClass: string;
}

function normalizarTexto(valor?: string | null): string {
  if (!valor) return "";
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatBrKg(valor: number): string {
  return Math.abs(valor).toFixed(1).replace(".", ",");
}

/**
 * Converte variantes legadas (ex.: UPPERCASE ou acentuação divergente) de volta
 * para o rótulo canônico de `CLINICAL_OBJECTIVES`, preservando valores customizados.
 */
export function normalizarObjetivoClinicoValor(valor?: string | null): string {
  if (!valor) return "";
  const trimmed = valor.trim();
  if (!trimmed) return "";

  const norm = normalizarTexto(trimmed);
  for (const canonico of CLINICAL_OBJECTIVES) {
    if (normalizarTexto(canonico) === norm) {
      return canonico;
    }
  }
  return trimmed;
}

/**
 * Resolve a fonte de verdade do objetivo (priorizando o primeiro valor não-vazio
 * na ordem fornecida) e classifica em `HIPERTROFIA` | `EMAGRECIMENTO` | `MANUTENCAO`.
 */
export function resolverObjetivoAtivo(
  ...candidatos: Array<string | null | undefined>
): string {
  for (const c of candidatos) {
    const norm = normalizarObjetivoClinicoValor(c);
    if (norm) return norm;
  }
  return "";
}

/**
 * Classifica o objetivo clínico ativo (sem concatenar valores antigos em conflito).
 */
export function classificarObjetivoClinico(
  objetivo?: string | null,
  ...fallbacks: Array<string | null | undefined>
): PerfilObjetivo {
  const ativo = resolverObjetivoAtivo(objetivo, ...fallbacks);
  const norm = normalizarTexto(ativo);
  if (!norm) return "MANUTENCAO";

  if (
    norm.includes("hipertrofia") ||
    norm.includes("ganho de massa") ||
    norm.includes("massa muscular") ||
    norm.includes("bulking") ||
    norm.includes("ganho muscular") ||
    norm.includes("ganhar massa") ||
    norm.includes("anabolism")
  ) {
    return "HIPERTROFIA";
  }

  if (
    norm.includes("emagrec") ||
    norm.includes("perda de peso") ||
    norm.includes("deficit") ||
    norm.includes("definicao") ||
    norm.includes("reducao de gordura") ||
    norm.includes("reducao ponderal") ||
    norm.includes("obesidade") ||
    norm.includes("sobrepeso")
  ) {
    return "EMAGRECIMENTO";
  }

  return "MANUTENCAO";
}

/**
 * Retorna subtítulos e paleta visual (Clinical Light) coerentes com o objetivo.
 */
export function getConfigObjetivoClinico(
  objetivo?: string | null
): ConfigObjetivoClinico {
  const perfil = classificarObjetivoClinico(objetivo);

  if (perfil === "HIPERTROFIA") {
    return {
      perfil,
      rotuloCurto: "Hipertrofia",
      subtituloPeso: "Evolução de ganho de massa",
      subtituloDiretriz: "Ganho de massa magra e força",
      badgeClass: "bg-teal-50 text-teal-800 border-teal-200/80",
      accentTextClass: "text-teal-700",
    };
  }

  if (perfil === "EMAGRECIMENTO") {
    return {
      perfil,
      rotuloCurto: "Emagrecimento",
      subtituloPeso: "Curva de emagrecimento saudável",
      subtituloDiretriz: "Redução de gordura com preservação muscular",
      badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
      accentTextClass: "text-emerald-700",
    };
  }

  return {
    perfil: "MANUTENCAO",
    rotuloCurto: "Manutenção",
    subtituloPeso: "Estabilidade e manutenção ponderal",
    subtituloDiretriz: "Equilíbrio metabólico e longevidade",
    badgeClass: "bg-sky-50 text-sky-800 border-sky-200/80",
    accentTextClass: "text-sky-700",
  };
}

/**
 * Avalia variação de peso (`pesoAtual - pesoInicial`) com semântica coerente ao objetivo:
 * - HIPERTROFIA: ganho = verde/positivo; queda = atenção/âmbar
 * - EMAGRECIMENTO: queda = verde/positivo; ganho = atenção/âmbar
 * - MANUTENCAO: estabilidade = verde/neutro
 */
export function avaliarVariacaoPeso(
  deltaKg: number,
  objetivo?: string | null
): AvaliacaoVariacaoPeso {
  const perfil = classificarObjetivoClinico(objetivo);
  const rounded = Math.round(deltaKg * 10) / 10;
  const direcao: "up" | "down" | "flat" =
    rounded >= 0.05 ? "up" : rounded <= -0.05 ? "down" : "flat";

  const sinalTexto =
    direcao === "flat"
      ? "Estável"
      : `${rounded > 0 ? "+" : "-"}${formatBrKg(rounded)} kg`;

  const positivo = {
    tom: "positivo" as const,
    textClass: "text-emerald-700",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
  };

  const atencao = {
    tom: "atencao" as const,
    textClass: "text-amber-700",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
  };

  const neutro = {
    tom: "neutro" as const,
    textClass: "text-slate-600",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  };

  if (perfil === "HIPERTROFIA") {
    if (rounded >= 0.1) {
      return { ...positivo, direcao, sinalTexto, rotulo: "Ganho positivo" };
    }
    if (rounded <= -0.1) {
      return { ...atencao, direcao, sinalTexto, rotulo: "Atenção à queda" };
    }
    return { ...neutro, direcao: "flat", sinalTexto: "Estável", rotulo: "Peso estável" };
  }

  if (perfil === "EMAGRECIMENTO") {
    if (rounded <= -0.1) {
      return { ...positivo, direcao, sinalTexto, rotulo: "Evolução positiva" };
    }
    if (rounded >= 0.1) {
      return { ...atencao, direcao, sinalTexto, rotulo: "Atenção ao ganho" };
    }
    return { ...neutro, direcao: "flat", sinalTexto: "Estável", rotulo: "Peso estável" };
  }

  // MANUTENCAO
  if (Math.abs(rounded) <= 1.0) {
    return {
      ...positivo,
      direcao,
      sinalTexto: direcao === "flat" ? "Estável" : sinalTexto,
      rotulo: "Faixa estável",
    };
  }
  return { ...neutro, direcao, sinalTexto, rotulo: "Variação registrada" };
}

/**
 * Avalia a distância entre o peso atual e o peso alvo com redação coerente ao objetivo
 * (ex.: sem sugerir "perder peso" para pacientes em Hipertrofia).
 */
export function avaliarDistanciaPesoAlvo(
  pesoAtualKg: number,
  pesoAlvoKg: number,
  objetivo?: string | null
): AvaliacaoDistanciaAlvo {
  if (!pesoAlvoKg || pesoAlvoKg <= 0 || !pesoAtualKg || pesoAtualKg <= 0) {
    return {
      label: "Sem peso alvo",
      atingida: false,
      badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    };
  }

  const perfil = classificarObjetivoClinico(objetivo);
  const diffParaAlvo = Math.round((pesoAlvoKg - pesoAtualKg) * 10) / 10;

  if (perfil === "HIPERTROFIA") {
    if (diffParaAlvo <= 0.05) {
      return {
        label: "Meta atingida",
        atingida: true,
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
      };
    }
    return {
      label: `Faltam +${formatBrKg(diffParaAlvo)} kg`,
      atingida: false,
      badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
    };
  }

  if (perfil === "EMAGRECIMENTO") {
    if (diffParaAlvo >= -0.05) {
      return {
        label: "Meta atingida",
        atingida: true,
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
      };
    }
    return {
      label: `Faltam -${formatBrKg(diffParaAlvo)} kg`,
      atingida: false,
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }

  // MANUTENCAO
  if (Math.abs(diffParaAlvo) <= 0.5) {
    return {
      label: "Na faixa alvo",
      atingida: true,
      badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    };
  }
  const sinalAtualVsAlvo = pesoAtualKg > pesoAlvoKg ? "+" : "-";
  return {
    label: `${sinalAtualVsAlvo}${formatBrKg(diffParaAlvo)} kg do alvo`,
    atingida: false,
    badgeClass: "bg-sky-50 text-sky-800 border-sky-200",
  };
}
