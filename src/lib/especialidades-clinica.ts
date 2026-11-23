/**
 * Paleta clínica oficial e utilitários compartilhados para Especialidades da Clínica.
 *
 * Fonte única de verdade para cores (Tailwind v4 com classes estáticas),
 * normalização de nomes/códigos legados e formatação de CRM.
 */

export const CORES_ESPECIALIDADE_TOKENS = [
  "emerald",
  "blue",
  "violet",
  "amber",
  "rose",
  "teal",
  "indigo",
  "slate",
] as const;

export type CorEspecialidadeToken = (typeof CORES_ESPECIALIDADE_TOKENS)[number];

export interface CorEspecialidadeEstilo {
  token: CorEspecialidadeToken;
  label: string;
  hex: string;
  dotClass: string;
  swatchClass: string;
  badgeClass: string;
  filterActiveClass: string;
  filterSolidActiveClass: string;
  modalPillActiveClass: string;
  cardConfirmedContainerClass: string;
  cardDefaultContainerClass: string;
  cardConfirmedBadgeClass: string;
  cardDefaultBadgeClass: string;
  monthPillConfirmedClass: string;
  monthPillDefaultClass: string;
}

export const PALETA_CORES_ESPECIALIDADE: Record<
  CorEspecialidadeToken,
  CorEspecialidadeEstilo
> = {
  emerald: {
    token: "emerald",
    label: "Esmeralda",
    hex: "#059669",
    dotClass: "bg-emerald-500",
    swatchClass: "bg-emerald-500 ring-emerald-300",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    filterActiveClass: "bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs",
    filterSolidActiveClass: "bg-emerald-600 text-white",
    modalPillActiveClass:
      "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-2xs ring-2 ring-emerald-500/20",
    cardConfirmedContainerClass:
      "bg-emerald-50/90 border-l-4 border-l-emerald-500 border border-emerald-200/80 shadow-xs",
    cardDefaultContainerClass:
      "bg-white border-l-4 border-l-emerald-400 border border-slate-200/90 shadow-xs hover:border-emerald-300",
    cardConfirmedBadgeClass: "bg-emerald-100 text-emerald-800",
    cardDefaultBadgeClass:
      "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
    monthPillConfirmedClass:
      "bg-emerald-100/90 text-emerald-900 border-emerald-300",
    monthPillDefaultClass:
      "bg-emerald-50/80 text-emerald-800 border-emerald-200/80",
  },
  blue: {
    token: "blue",
    label: "Azul",
    hex: "#2563eb",
    dotClass: "bg-blue-500",
    swatchClass: "bg-blue-500 ring-blue-300",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
    filterActiveClass: "bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs",
    filterSolidActiveClass: "bg-blue-600 text-white",
    modalPillActiveClass:
      "bg-blue-50 border-blue-500 text-blue-900 shadow-2xs ring-2 ring-blue-500/20",
    cardConfirmedContainerClass:
      "bg-blue-50/90 border-l-4 border-l-blue-500 border border-blue-200/80 shadow-xs",
    cardDefaultContainerClass:
      "bg-white border-l-4 border-l-blue-400 border border-slate-200/90 shadow-xs hover:border-blue-300",
    cardConfirmedBadgeClass: "bg-blue-100 text-blue-800",
    cardDefaultBadgeClass:
      "bg-blue-50 text-blue-700 border border-blue-200/60",
    monthPillConfirmedClass: "bg-blue-100/90 text-blue-900 border-blue-300",
    monthPillDefaultClass: "bg-blue-50/80 text-blue-800 border-blue-200/80",
  },
  violet: {
    token: "violet",
    label: "Violeta",
    hex: "#7c3aed",
    dotClass: "bg-violet-500",
    swatchClass: "bg-violet-500 ring-violet-300",
    badgeClass: "bg-violet-50 text-violet-800 border-violet-200",
    filterActiveClass: "bg-violet-50 text-violet-800 border border-violet-200 shadow-2xs",
    filterSolidActiveClass: "bg-violet-600 text-white",
    modalPillActiveClass:
      "bg-violet-50 border-violet-500 text-violet-900 shadow-2xs ring-2 ring-violet-500/20",
    cardConfirmedContainerClass:
      "bg-violet-50/90 border-l-4 border-l-violet-500 border border-violet-200/80 shadow-xs",
    cardDefaultContainerClass:
      "bg-white border-l-4 border-l-violet-400 border border-slate-200/90 shadow-xs hover:border-violet-300",
    cardConfirmedBadgeClass: "bg-violet-100 text-violet-800",
    cardDefaultBadgeClass:
      "bg-violet-50 text-violet-700 border border-violet-200/60",
    monthPillConfirmedClass:
      "bg-violet-100/90 text-violet-900 border-violet-300",
    monthPillDefaultClass:
      "bg-violet-50/80 text-violet-800 border-violet-200/80",
  },
  amber: {
    token: "amber",
    label: "Âmbar",
    hex: "#d97706",
    dotClass: "bg-amber-500",
    swatchClass: "bg-amber-500 ring-amber-300",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    filterActiveClass: "bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs",
    filterSolidActiveClass: "bg-amber-600 text-white",
    modalPillActiveClass:
      "bg-amber-50 border-amber-500 text-amber-900 shadow-2xs ring-2 ring-amber-500/20",
    cardConfirmedContainerClass:
      "bg-amber-50/90 border-l-4 border-l-amber-500 border border-amber-200/80 shadow-xs",
    cardDefaultContainerClass:
      "bg-white border-l-4 border-l-amber-400 border border-slate-200/90 shadow-xs hover:border-amber-300",
    cardConfirmedBadgeClass: "bg-amber-100 text-amber-800",
    cardDefaultBadgeClass:
      "bg-amber-50 text-amber-700 border border-amber-200/60",
    monthPillConfirmedClass:
      "bg-amber-100/90 text-amber-900 border-amber-300",
    monthPillDefaultClass:
      "bg-amber-50/80 text-amber-800 border-amber-200/80",
  },
  rose: {
    token: "rose",
    label: "Rosa",
    hex: "#e11d48",
    dotClass: "bg-rose-500",
    swatchClass: "bg-rose-500 ring-rose-300",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-200",
    filterActiveClass: "bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs",
    filterSolidActiveClass: "bg-rose-600 text-white",
    modalPillActiveClass:
      "bg-rose-50 border-rose-500 text-rose-900 shadow-2xs ring-2 ring-rose-500/20",
    cardConfirmedContainerClass:
      "bg-rose-50/90 border-l-4 border-l-rose-500 border border-rose-200/80 shadow-xs",
    cardDefaultContainerClass:
      "bg-white border-l-4 border-l-rose-400 border border-slate-200/90 shadow-xs hover:border-rose-300",
    cardConfirmedBadgeClass: "bg-rose-100 text-rose-800",
    cardDefaultBadgeClass:
      "bg-rose-50 text-rose-700 border border-rose-200/60",
    monthPillConfirmedClass: "bg-rose-100/90 text-rose-900 border-rose-300",
    monthPillDefaultClass: "bg-rose-50/80 text-rose-800 border-rose-200/80",
  },
  teal: {
    token: "teal",
    label: "Turquesa",
    hex: "#0d9488",
    dotClass: "bg-teal-500",
    swatchClass: "bg-teal-500 ring-teal-300",
    badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
    filterActiveClass: "bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs",
    filterSolidActiveClass: "bg-teal-600 text-white",
    modalPillActiveClass:
      "bg-teal-50 border-teal-500 text-teal-900 shadow-2xs ring-2 ring-teal-500/20",
    cardConfirmedContainerClass:
      "bg-teal-50/90 border-l-4 border-l-teal-500 border border-teal-200/80 shadow-xs",
    cardDefaultContainerClass:
      "bg-white border-l-4 border-l-teal-400 border border-slate-200/90 shadow-xs hover:border-teal-300",
    cardConfirmedBadgeClass: "bg-teal-100 text-teal-800",
    cardDefaultBadgeClass:
      "bg-teal-50 text-teal-700 border border-teal-200/60",
    monthPillConfirmedClass: "bg-teal-100/90 text-teal-900 border-teal-300",
    monthPillDefaultClass: "bg-teal-50/80 text-teal-800 border-teal-200/80",
  },
  indigo: {
    token: "indigo",
    label: "Índigo",
    hex: "#4f46e5",
    dotClass: "bg-indigo-500",
    swatchClass: "bg-indigo-500 ring-indigo-300",
    badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200",
    filterActiveClass: "bg-indigo-50 text-indigo-800 border border-indigo-200 shadow-2xs",
    filterSolidActiveClass: "bg-indigo-600 text-white",
    modalPillActiveClass:
      "bg-indigo-50 border-indigo-500 text-indigo-900 shadow-2xs ring-2 ring-indigo-500/20",
    cardConfirmedContainerClass:
      "bg-indigo-50/90 border-l-4 border-l-indigo-500 border border-indigo-200/80 shadow-xs",
    cardDefaultContainerClass:
      "bg-white border-l-4 border-l-indigo-400 border border-slate-200/90 shadow-xs hover:border-indigo-300",
    cardConfirmedBadgeClass: "bg-indigo-100 text-indigo-800",
    cardDefaultBadgeClass:
      "bg-indigo-50 text-indigo-700 border border-indigo-200/60",
    monthPillConfirmedClass:
      "bg-indigo-100/90 text-indigo-900 border-indigo-300",
    monthPillDefaultClass:
      "bg-indigo-50/80 text-indigo-800 border-indigo-200/80",
  },
  slate: {
    token: "slate",
    label: "Ardósia",
    hex: "#475569",
    dotClass: "bg-slate-500",
    swatchClass: "bg-slate-500 ring-slate-300",
    badgeClass: "bg-slate-100 text-slate-800 border-slate-300",
    filterActiveClass: "bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs",
    filterSolidActiveClass: "bg-slate-700 text-white",
    modalPillActiveClass:
      "bg-slate-100 border-slate-500 text-slate-900 shadow-2xs ring-2 ring-slate-500/20",
    cardConfirmedContainerClass:
      "bg-slate-100/90 border-l-4 border-l-slate-500 border border-slate-300/80 shadow-xs",
    cardDefaultContainerClass:
      "bg-white border-l-4 border-l-slate-400 border border-slate-200/90 shadow-xs hover:border-slate-300",
    cardConfirmedBadgeClass: "bg-slate-200 text-slate-800",
    cardDefaultBadgeClass:
      "bg-slate-100 text-slate-700 border border-slate-200/80",
    monthPillConfirmedClass:
      "bg-slate-200/90 text-slate-900 border-slate-300",
    monthPillDefaultClass:
      "bg-slate-100/80 text-slate-800 border-slate-200/80",
  },
};

export const CORES_ESPECIALIDADE_LISTA: readonly CorEspecialidadeEstilo[] =
  CORES_ESPECIALIDADE_TOKENS.map((t) => PALETA_CORES_ESPECIALIDADE[t]);

export interface EspecialidadeDTO {
  id: string;
  nome: string;
  cor: CorEspecialidadeToken;
  corHex: string;
  ativo: boolean;
  ordem: number;
  codigoLegado: string;
  medicosAtivosCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export function isCorEspecialidadeValida(
  cor: string | null | undefined,
): cor is CorEspecialidadeToken {
  if (!cor) return false;
  return (CORES_ESPECIALIDADE_TOKENS as readonly string[]).includes(
    cor.trim().toLowerCase(),
  );
}

export function normalizarCorEspecialidade(
  cor?: string | null,
  fallback: CorEspecialidadeToken = "emerald",
): CorEspecialidadeToken {
  const clean = typeof cor === "string" ? cor.trim().toLowerCase() : "";
  if (isCorEspecialidadeValida(clean)) {
    return clean;
  }
  return fallback;
}

export function getCorEspecialidadeEstilo(
  cor?: string | null,
): CorEspecialidadeEstilo {
  return PALETA_CORES_ESPECIALIDADE[normalizarCorEspecialidade(cor)];
}

export function normalizarTextoEspecialidade(valor?: string | null): string {
  if (!valor) return "";
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converte o nome de uma especialidade em um código compatível com a coluna
 * legada AGENDAMENTOS.ESPECIALIDADE (VARCHAR2(40 CHAR)).
 * Ex.: "Endocrinologia" -> "ENDOCRINOLOGIA"
 *      "Cirurgia Plástica" -> "CIRURGIA_PLASTICA"
 *      "Dermatologia Clínica" -> "DERMATOLOGIA_CLINICA"
 */
export function gerarCodigoEspecialidadeLegado(nome?: string | null): string {
  const norm = normalizarTextoEspecialidade(nome)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (norm || "GERAL").slice(0, 40);
}

/**
 * Formata um código legado gravado em AGENDAMENTOS.ESPECIALIDADE para exibição legível
 * quando não houver vínculo na tabela ESPECIALIDADES.
 */
export function formatarCodigoEspecialidadeLegado(
  codigo?: string | null,
): string {
  const raw = typeof codigo === "string" ? codigo.trim() : "";
  if (!raw) return "Endocrinologia";
  const upper = raw.toUpperCase();
  if (upper === "ENDOCRINOLOGIA") return "Endocrinologia";
  if (upper === "CIRURGIA_PLASTICA") return "Cirurgia Plástica";
  return raw
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function inferirCorPorCodigoLegado(
  codigoOuNome?: string | null,
): CorEspecialidadeToken {
  const norm = normalizarTextoEspecialidade(codigoOuNome);
  if (norm.includes("plastica") || norm === "cirurgia_plastica") {
    return "blue";
  }
  return "emerald";
}

/**
 * Resolve qual especialidade cadastrada melhor corresponde a um texto livre
 * (usado no seed/backfill automático de USERS.SPECIALTY e em agendamentos históricos).
 */
export function encontrarEspecialidadeCompativel<
  T extends { id: string; nome: string },
>(texto: string | null | undefined, especialidades: readonly T[]): T | null {
  const norm = normalizarTextoEspecialidade(texto);
  if (!norm || especialidades.length === 0) return null;

  const codigoTexto = gerarCodigoEspecialidadeLegado(texto);

  // 1. Match exato por nome normalizado ou código legado
  const exata = especialidades.find(
    (e) =>
      normalizarTextoEspecialidade(e.nome) === norm ||
      gerarCodigoEspecialidadeLegado(e.nome) === codigoTexto,
  );
  if (exata) return exata;

  // 2. Match semântico para formatos históricos ("Endocrinologia & Metabologia", "Cirurgia Plástica Reparadora")
  if (norm.includes("endocrin")) {
    const endo = especialidades.find((e) =>
      normalizarTextoEspecialidade(e.nome).includes("endocrin"),
    );
    if (endo) return endo;
  }

  if (norm.includes("plastica") || norm.includes("cirurgia_plastica")) {
    const plast = especialidades.find((e) =>
      normalizarTextoEspecialidade(e.nome).includes("plastica"),
    );
    if (plast) return plast;
  }

  // 3. Substring: nome da especialidade contido no texto do usuário
  const porInclusao = especialidades.find((e) => {
    const espNorm = normalizarTextoEspecialidade(e.nome);
    return espNorm.length >= 4 && norm.includes(espNorm);
  });
  if (porInclusao) return porInclusao;

  return null;
}

/**
 * Compõe o texto final (<= 100 chars) para persistência em USERS.SPECIALTY,
 * preservando compatibilidade com Prontuário, PDFs e App Mobile.
 * - Se o usuário informou subespecialidade/título de exibição, preserva esse texto.
 * - Se deixou em branco, grava o nome da especialidade principal como fallback amigável.
 */
export function comporTextoSpecialtyUsuario(
  especialidadeNome?: string | null,
  subespecialidade?: string | null,
): string | null {
  const subClean =
    typeof subespecialidade === "string" ? subespecialidade.trim() : "";
  if (subClean) {
    return subClean.slice(0, 100);
  }
  const espClean =
    typeof especialidadeNome === "string" ? especialidadeNome.trim() : "";
  return espClean ? espClean.slice(0, 100) : null;
}

/**
 * Extrai o texto de subespecialidade para preencher o campo opcional do modal Editar
 * (retorna string vazia se o texto salvo for idêntico ao nome da especialidade principal).
 */
export function extrairSubespecialidadeParaForm(
  specialtyRaw?: string | null,
  especialidadeNome?: string | null,
): string {
  const raw = typeof specialtyRaw === "string" ? specialtyRaw.trim() : "";
  if (!raw) return "";
  if (
    especialidadeNome &&
    normalizarTextoEspecialidade(raw) ===
      normalizarTextoEspecialidade(especialidadeNome)
  ) {
    return "";
  }
  return raw;
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
