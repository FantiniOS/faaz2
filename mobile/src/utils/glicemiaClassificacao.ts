import type {
  MomentoClinicoGlicemia,
  StatusCelulaGlicemia,
} from "../services/api";

export interface AlvosGlicemicos {
  alvoJejumMin?: number | null;
  alvoJejumMax?: number | null;
  alvoPosMax?: number | null;
}

export interface AlvosGlicemicosResolvidos {
  alvoJejumMin: number;
  alvoJejumMax: number;
  alvoPosMax: number;
}

export const ALVOS_GLICEMIA_PADRAO: AlvosGlicemicosResolvidos = {
  alvoJejumMin: 70,
  alvoJejumMax: 130,
  alvoPosMax: 180,
};

export const MOMENTO_GLICEMIA_LABELS: Record<MomentoClinicoGlicemia, string> = {
  JEJUM: "Jejum",
  POS_CAFE: "Pós-Café",
  PRE_ALMOCO: "Pré-Almoço",
  POS_ALMOCO: "Pós-Almoço",
  PRE_JANTAR: "Pré-Jantar",
  POS_JANTAR: "Pós-Jantar",
  AO_DEITAR: "Ao Deitar",
  AVULSO: "Avulsa",
};

export interface ClassificacaoGlicemia {
  status: StatusCelulaGlicemia;
  momentoNormalizado: MomentoClinicoGlicemia;
  isPosPrandial: boolean;
  alvoMin: number;
  alvoMax: number;
  isNoAlvo: boolean;
  isForaDoAlvo: boolean;
  isCritico: boolean;
  tipoAlerta: "HIPOGLICEMIA" | "HIPERGLICEMIA" | "NORMAL";
  label: string;
  dotColor: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  pillSub: string;
}

export interface ResumoGlicemiasClinicas {
  totalMedicoes: number;
  dentroDaMeta: number;
  foraDoAlvo: number;
  percentualNoAlvo: number | null;
  episodiosHipo: number;
  episodiosAtencao: number;
  episodiosHiper: number;
  alertasCriticos: number;
  mediaGeral: number | null;
  mediaJejum: number | null;
  mediaPosPrandial: number | null;
}

/**
 * Remove acentos, sufixos entre parênteses (ex.: "(+4 UI)"), espaços extras
 * e padroniza separadores para underscore em caixa alta.
 */
function limparChaveMomento(raw?: string | null): string {
  if (!raw) return "";
  return String(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Normaliza qualquer formato de momento clínico retornado pela API ou formatado na UI
 * (ex.: "pre_jantar", "PRE_JANTAR", "Pré-Jantar", "pos_almoco", "Pós-Almoço (+4 UI)",
 * "ao_deitar", "Ao Deitar", "jejum", "Em Jejum", "POS_PRANDIAL", "CASUAL").
 */
export function normalizarMomentoGlicemia(
  momento?: string | null
): MomentoClinicoGlicemia {
  const key = limparChaveMomento(momento);
  if (!key) return "AVULSO";

  if (key === "JEJUM" || key.includes("JEJUM")) return "JEJUM";
  if (key === "AO_DEITAR" || key.includes("DEITAR") || key.includes("DORMIR")) {
    return "AO_DEITAR";
  }

  if (key === "PRE_ALMOCO" || (key.includes("PRE") && key.includes("ALMOC"))) {
    return "PRE_ALMOCO";
  }
  if (key === "PRE_JANTAR" || (key.includes("PRE") && key.includes("JANT"))) {
    return "PRE_JANTAR";
  }

  if (key === "POS_CAFE" || (key.includes("POS") && key.includes("CAFE"))) {
    return "POS_CAFE";
  }
  if (key === "POS_ALMOCO" || (key.includes("POS") && key.includes("ALMOC"))) {
    return "POS_ALMOCO";
  }
  if (key === "POS_JANTAR" || (key.includes("POS") && key.includes("JANT"))) {
    return "POS_JANTAR";
  }

  // Legado pós-prandial genérico ("POS_PRANDIAL", "POS_REFEICAO", "Pós-Refeição")
  if (
    key === "POS_PRANDIAL" ||
    key === "POS_REFEICAO" ||
    key.startsWith("POS_") ||
    key === "POS"
  ) {
    return "POS_ALMOCO";
  }

  // Pré-refeição genérico ("PRE_PRANDIAL", "PRE_REFEICAO", "PRE_CAFE")
  if (key.startsWith("PRE_")) {
    return "JEJUM";
  }

  return "AVULSO";
}

/**
 * Define se o momento segue o teto Pós-Refeição (padrão <= 180 mg/dL)
 * ou o teto Jejum / Pré-Refeição / Ao Deitar (padrão 70–130 mg/dL).
 */
export function isMomentoPosPrandial(momento?: string | null): boolean {
  const norm = normalizarMomentoGlicemia(momento);
  return (
    norm === "POS_CAFE" ||
    norm === "POS_ALMOCO" ||
    norm === "POS_JANTAR" ||
    norm === "AVULSO"
  );
}

export function getLabelMomentoGlicemia(momento?: string | null): string {
  const norm = normalizarMomentoGlicemia(momento);
  return MOMENTO_GLICEMIA_LABELS[norm] || "Avulsa";
}

export function resolverAlvosGlicemicos(
  alvos?: AlvosGlicemicos | null
): AlvosGlicemicosResolvidos {
  const minRaw = Number(alvos?.alvoJejumMin);
  const maxJejumRaw = Number(alvos?.alvoJejumMax);
  const maxPosRaw = Number(alvos?.alvoPosMax);

  return {
    alvoJejumMin:
      Number.isFinite(minRaw) && minRaw > 0
        ? minRaw
        : ALVOS_GLICEMIA_PADRAO.alvoJejumMin,
    alvoJejumMax:
      Number.isFinite(maxJejumRaw) && maxJejumRaw > 0
        ? maxJejumRaw
        : ALVOS_GLICEMIA_PADRAO.alvoJejumMax,
    alvoPosMax:
      Number.isFinite(maxPosRaw) && maxPosRaw > 0
        ? maxPosRaw
        : ALVOS_GLICEMIA_PADRAO.alvoPosMax,
  };
}

export function getFaixaAlvoMomento(
  momento?: string | null,
  alvos?: AlvosGlicemicos | null
): {
  min: number;
  max: number;
  isPosPrandial: boolean;
  momentoNormalizado: MomentoClinicoGlicemia;
} {
  const resolvidos = resolverAlvosGlicemicos(alvos);
  const momentoNormalizado = normalizarMomentoGlicemia(momento);
  const pos = isMomentoPosPrandial(momentoNormalizado);

  return {
    min: resolvidos.alvoJejumMin,
    max: pos ? resolvidos.alvoPosMax : resolvidos.alvoJejumMax,
    isPosPrandial: pos,
    momentoNormalizado,
  };
}

/**
 * Fonte única de verdade para classificação clínica da glicemia (resumo + linhas + cards):
 * - < alvoJejumMin (padrão 70): Hipoglicemia (HIPO — vermelho/alerta)
 * - Entre alvoMin e teto do momento (70–130 Jejum/Pré/Ao Deitar; 70–180 Pós): No alvo (ALVO — verde)
 * - Acima do teto do momento até 250: Acima do alvo (ATENCAO — âmbar, nunca verde)
 * - > 250: Acima do alvo / Hiperglicemia severa (HIPER — vermelho forte, nunca verde)
 */
export function classificarGlicemiaClinica(
  valor: number,
  momento?: string | null,
  alvos?: AlvosGlicemicos | null
): ClassificacaoGlicemia {
  const num = Number(valor);
  const { min: alvoMin, max: alvoMax, isPosPrandial, momentoNormalizado } =
    getFaixaAlvoMomento(momento, alvos);

  let status: StatusCelulaGlicemia;
  if (num < alvoMin) {
    status = "HIPO";
  } else if (num > 250) {
    status = "HIPER";
  } else if (num <= alvoMax) {
    status = "ALVO";
  } else {
    status = "ATENCAO";
  }

  if (status === "HIPO") {
    return {
      status,
      momentoNormalizado,
      isPosPrandial,
      alvoMin,
      alvoMax,
      isNoAlvo: false,
      isForaDoAlvo: true,
      isCritico: true,
      tipoAlerta: "HIPOGLICEMIA",
      label: "Hipoglicemia",
      dotColor: "#e11d48",
      badgeBg: "#fff1f2",
      badgeBorder: "#fda4af",
      badgeText: "#be123c",
      pillBg: "#ffe4e6",
      pillBorder: "#fda4af",
      pillText: "#9f1239",
      pillSub: "#be123c",
    };
  }

  if (status === "ALVO") {
    return {
      status,
      momentoNormalizado,
      isPosPrandial,
      alvoMin,
      alvoMax,
      isNoAlvo: true,
      isForaDoAlvo: false,
      isCritico: false,
      tipoAlerta: "NORMAL",
      label: "No alvo",
      dotColor: "#059669",
      badgeBg: "#ecfdf5",
      badgeBorder: "#a7f3d0",
      badgeText: "#047857",
      pillBg: "#ecfdf5",
      pillBorder: "#a7f3d0",
      pillText: "#065f46",
      pillSub: "#047857",
    };
  }

  if (status === "HIPER") {
    return {
      status,
      momentoNormalizado,
      isPosPrandial,
      alvoMin,
      alvoMax,
      isNoAlvo: false,
      isForaDoAlvo: true,
      isCritico: true,
      tipoAlerta: "HIPERGLICEMIA",
      label: "Acima do alvo",
      dotColor: "#e11d48",
      badgeBg: "#fff1f2",
      badgeBorder: "#fda4af",
      badgeText: "#be123c",
      pillBg: "#e11d48",
      pillBorder: "#be123c",
      pillText: "#ffffff",
      pillSub: "#ffe4e6",
    };
  }

  // status === "ATENCAO" (acima do teto do momento até 250 mg/dL)
  return {
    status,
    momentoNormalizado,
    isPosPrandial,
    alvoMin,
    alvoMax,
    isNoAlvo: false,
    isForaDoAlvo: true,
    isCritico: false,
    tipoAlerta: "HIPERGLICEMIA",
    label: "Acima do alvo",
    dotColor: "#d97706",
    badgeBg: "#fffbeb",
    badgeBorder: "#fde68a",
    badgeText: "#b45309",
    pillBg: "#fffbeb",
    pillBorder: "#fde68a",
    pillText: "#92400e",
    pillSub: "#b45309",
  };
}

/**
 * Consolida os indicadores de resumo de um conjunto de medições utilizando
 * exatamente a mesma função `classificarGlicemiaClinica` usada nas linhas da lista.
 */
export function resumirGlicemiasClinicas(
  medicoes: ReadonlyArray<{
    valor: number;
    momento?: string | null;
    momentoClinico?: string | null;
  }>,
  alvos?: AlvosGlicemicos | null
): ResumoGlicemiasClinicas {
  let totalMedicoes = 0;
  let dentroDaMeta = 0;
  let episodiosHipo = 0;
  let episodiosAtencao = 0;
  let episodiosHiper = 0;
  let somaGeral = 0;
  let somaJejum = 0;
  let qtdJejum = 0;
  let somaPos = 0;
  let qtdPos = 0;

  for (const item of medicoes) {
    const val = Number(item.valor);
    if (!Number.isFinite(val) || val <= 0) continue;

    const c = classificarGlicemiaClinica(
      val,
      item.momentoClinico ?? item.momento,
      alvos
    );

    totalMedicoes += 1;
    somaGeral += val;

    if (c.status === "ALVO") dentroDaMeta += 1;
    else if (c.status === "HIPO") episodiosHipo += 1;
    else if (c.status === "ATENCAO") episodiosAtencao += 1;
    else if (c.status === "HIPER") episodiosHiper += 1;

    if (c.momentoNormalizado === "JEJUM") {
      somaJejum += val;
      qtdJejum += 1;
    } else if (
      c.momentoNormalizado === "POS_CAFE" ||
      c.momentoNormalizado === "POS_ALMOCO" ||
      c.momentoNormalizado === "POS_JANTAR"
    ) {
      somaPos += val;
      qtdPos += 1;
    }
  }

  const foraDoAlvo = Math.max(0, totalMedicoes - dentroDaMeta);
  const alertasCriticos = episodiosHipo + episodiosHiper;

  return {
    totalMedicoes,
    dentroDaMeta,
    foraDoAlvo,
    percentualNoAlvo:
      totalMedicoes > 0
        ? Math.round((dentroDaMeta / totalMedicoes) * 100)
        : null,
    episodiosHipo,
    episodiosAtencao,
    episodiosHiper,
    alertasCriticos,
    mediaGeral: totalMedicoes > 0 ? Math.round(somaGeral / totalMedicoes) : null,
    mediaJejum: qtdJejum > 0 ? Math.round(somaJejum / qtdJejum) : null,
    mediaPosPrandial: qtdPos > 0 ? Math.round(somaPos / qtdPos) : null,
  };
}
