/**
 * Catálogo centralizado de especialidades de atendimento da Clínica FAAZ
 * + utilitários puros para normalização, composição e leitura do campo USERS.SPECIALTY.
 *
 * Fonte única de verdade compartilhada entre Gestão da Equipe, Agenda e APIs.
 */

export type EspecialidadeAgendaCodigo = "ENDOCRINOLOGIA" | "CIRURGIA_PLASTICA";
export type EspecialidadeSelecaoCodigo = EspecialidadeAgendaCodigo | "OUTRA";

export interface EspecialidadeClinicaConfig {
  codigo: EspecialidadeAgendaCodigo;
  label: string;
  labelCurto: string;
  corHex: string;
  badgeClass: string;
  placeholderSubespecialidade: string;
}

export const ESPECIALIDADES_CLINICA: readonly EspecialidadeClinicaConfig[] = [
  {
    codigo: "ENDOCRINOLOGIA",
    label: "Endocrinologia",
    labelCurto: "Endocrino",
    corHex: "#059669",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    placeholderSubespecialidade: "Ex: Endocrinologia & Metabologia",
  },
  {
    codigo: "CIRURGIA_PLASTICA",
    label: "Cirurgia Plástica",
    labelCurto: "Cir. Plástica",
    corHex: "#2563eb",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
    placeholderSubespecialidade: "Ex: Cirurgia Plástica Reparadora",
  },
] as const;

export const ESPECIALIDADES_AGENDA_VALIDAS: readonly EspecialidadeAgendaCodigo[] =
  ESPECIALIDADES_CLINICA.map((e) => e.codigo);

const SEPARADOR_SUB = " — ";

function normalizarTextoComparacao(valor?: string | null): string {
  if (!valor) return "";
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function getEspecialidadeConfig(
  codigo?: string | null,
): EspecialidadeClinicaConfig | null {
  if (!codigo) return null;
  const upper = codigo.trim().toUpperCase();
  return ESPECIALIDADES_CLINICA.find((e) => e.codigo === upper) ?? null;
}

export interface EspecialidadeParsed {
  codigo: EspecialidadeSelecaoCodigo | null;
  labelPrincipal: string | null;
  subespecialidade: string;
  exibicao: string | null;
  corHex: string;
  badgeClass: string;
}

/**
 * Interpreta o valor persistido em USERS.SPECIALTY (VARCHAR2(100)),
 * preservando compatibilidade com cadastros existentes (ex.: "Endocrinologia & Metabologia")
 * e com o formato composto ("Endocrinologia — Metabologia e Diabetes").
 */
export function parseEspecialidadeUsuario(
  rawSpecialty?: string | null,
): EspecialidadeParsed {
  const raw = typeof rawSpecialty === "string" ? rawSpecialty.trim() : "";
  if (!raw) {
    return {
      codigo: null,
      labelPrincipal: null,
      subespecialidade: "",
      exibicao: null,
      corHex: "#059669",
      badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    };
  }

  const norm = normalizarTextoComparacao(raw);

  // 1. Detecta Endocrinologia
  if (norm === "endocrinologia" || norm.includes("endocrin")) {
    const cfg = ESPECIALIDADES_CLINICA[0];
    let sub = "";
    if (norm !== "endocrinologia") {
      if (raw.includes(SEPARADOR_SUB)) {
        const [, resto] = raw.split(SEPARADOR_SUB);
        sub = (resto || "").trim();
      } else {
        sub = raw;
      }
    }
    return {
      codigo: cfg.codigo,
      labelPrincipal: cfg.label,
      subespecialidade: sub,
      exibicao: raw,
      corHex: cfg.corHex,
      badgeClass: cfg.badgeClass,
    };
  }

  // 2. Detecta Cirurgia Plástica
  if (
    norm === "cirurgia_plastica" ||
    norm === "cirurgia plastica" ||
    norm.includes("cirurgia plastica") ||
    norm.includes("plastica")
  ) {
    const cfg = ESPECIALIDADES_CLINICA[1];
    let sub = "";
    if (norm !== "cirurgia plastica" && norm !== "cirurgia_plastica") {
      if (raw.includes(SEPARADOR_SUB)) {
        const [, resto] = raw.split(SEPARADOR_SUB);
        sub = (resto || "").trim();
      } else {
        sub = raw;
      }
    }
    return {
      codigo: cfg.codigo,
      labelPrincipal: cfg.label,
      subespecialidade: sub,
      exibicao: raw === "CIRURGIA_PLASTICA" ? cfg.label : raw,
      corHex: cfg.corHex,
      badgeClass: cfg.badgeClass,
    };
  }

  // 3. Outra especialidade customizada
  return {
    codigo: "OUTRA",
    labelPrincipal: raw,
    subespecialidade: raw,
    exibicao: raw,
    corHex: "#0f766e",
    badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
  };
}

/**
 * Compõe o texto final (<= 100 chars) para persistência em USERS.SPECIALTY
 * a partir da especialidade selecionada + subespecialidade/título opcional.
 */
export function comporEspecialidadeArmazenada(
  especialidadeCodigo?: string | null,
  subespecialidade?: string | null,
  fallbackRaw?: string | null,
): string | null {
  const codigoClean =
    typeof especialidadeCodigo === "string"
      ? especialidadeCodigo.trim().toUpperCase()
      : "";
  const subClean =
    typeof subespecialidade === "string" ? subespecialidade.trim() : "";

  const cfg = getEspecialidadeConfig(codigoClean);
  if (cfg) {
    if (!subClean) {
      return cfg.label;
    }
    const subNorm = normalizarTextoComparacao(subClean);
    const labelNorm = normalizarTextoComparacao(cfg.label);
    if (subNorm === labelNorm) {
      return cfg.label;
    }
    if (subNorm.includes(labelNorm) || (cfg.codigo === "ENDOCRINOLOGIA" && subNorm.includes("endocrin"))) {
      return subClean.slice(0, 100);
    }
    return `${cfg.label}${SEPARADOR_SUB}${subClean}`.slice(0, 100);
  }

  if (codigoClean === "OUTRA") {
    return subClean ? subClean.slice(0, 100) : null;
  }

  const fallback = typeof fallbackRaw === "string" ? fallbackRaw.trim() : "";
  if (fallback) {
    // Se enviaram o código diretamente em `especialidade` (ex.: "CIRURGIA_PLASTICA")
    const cfgFallback = getEspecialidadeConfig(fallback);
    if (cfgFallback) return cfgFallback.label;
    return fallback.slice(0, 100);
  }

  return subClean ? subClean.slice(0, 100) : null;
}

/**
 * Normaliza entrada de CRM removendo prefixo "CRM" duplicado para armazenamento limpo em COUNCIL_NUMBER.
 */
export function normalizarCrmArmazenado(rawCrm?: string | null): string | null {
  if (typeof rawCrm !== "string") return null;
  const trimmed = rawCrm.trim();
  if (!trimmed) return null;
  const semPrefixo = trimmed.replace(/^crm[\s:-]*/i, "").trim();
  return (semPrefixo || trimmed).slice(0, 40);
}
