/**
 * Domínio compartilhado do Mapa Glicêmico & Controle de Insulina (Web + API)
 * Regras clínicas puras, sem dependências de banco ou React.
 */

export type ModoProtocoloGlicemico =
  | "LIVRE"
  | "JEJUM"
  | "PAREADO"
  | "MAPA_COMPLETO"
  | "PERSONALIZADO";

export type SlotMapaGlicemico =
  | "JEJUM"
  | "POS_CAFE"
  | "PRE_ALMOCO"
  | "POS_ALMOCO"
  | "PRE_JANTAR"
  | "POS_JANTAR"
  | "AO_DEITAR";

export type MomentoClinicoGlicemia = SlotMapaGlicemico | "AVULSO";

export type StatusCelulaGlicemia = "HIPO" | "ALVO" | "ATENCAO" | "HIPER";

export type TipoInsulina = "BASAL" | "RAPIDA";

export interface ProtocoloGlicemicoDTO {
  pacienteId: string;
  ativo: boolean;
  usaInsulina: boolean;
  modo: ModoProtocoloGlicemico;
  slotsAtivos: SlotMapaGlicemico[];
  alvoJejumMin: number;
  alvoJejumMax: number;
  alvoPosMax: number;
  insulinaBasalNome: string | null;
  insulinaBasalDoseRef: number | null;
  insulinaBasalHorario: string | null;
  insulinaRapidaNome: string | null;
  orientacaoHipo: string | null;
  orientacaoHiper: string | null;
  updatedAt: string | null;
}

export interface CelulaMapaGlicemicoDTO {
  id: string;
  valor: number;
  status: StatusCelulaGlicemia;
  hora: string;
  dataRegistro: string;
  momentoClinico: MomentoClinicoGlicemia;
  insulinaUI?: number | null;
  insulinaNome?: string | null;
  contextoTags: string[];
}

export interface DoseBasalDiaDTO {
  id: string;
  unidades: number;
  nome: string | null;
  hora: string;
  aplicadoEm: string;
  observacao: string | null;
}

export interface LinhaMapaGlicemicoDTO {
  dataDia: string;
  dataLabel: string;
  diaSemanaCurto: string;
  celulas: Partial<Record<SlotMapaGlicemico, CelulaMapaGlicemicoDTO>>;
  avulsos: CelulaMapaGlicemicoDTO[];
  basalDoses: DoseBasalDiaDTO[];
}

export interface ResumoMapaGlicemicoDTO {
  mediaGeral: number | null;
  mediaJejum: number | null;
  mediaPosPrandial: number | null;
  percentualNoAlvo: number | null;
  episodiosHipo: number;
  episodiosHiper: number;
  totalMedicoes: number;
  totalAplicacoesInsulina: number;
  mediaDiariaBasalUI: number | null;
  mediaDiariaRapidaUI: number | null;
}

export type MediasPorColunaMapa = Record<SlotMapaGlicemico, number | null>;

export interface MapaGlicemicoResponseDTO {
  success: boolean;
  dias: number;
  hojeDataDia: string;
  protocolo: ProtocoloGlicemicoDTO;
  resumo: ResumoMapaGlicemicoDTO;
  linhas: LinhaMapaGlicemicoDTO[];
  mediasPorColuna: MediasPorColunaMapa;
}

export const SLOTS_MAPA_ORDER: readonly SlotMapaGlicemico[] = [
  "JEJUM",
  "POS_CAFE",
  "PRE_ALMOCO",
  "POS_ALMOCO",
  "PRE_JANTAR",
  "POS_JANTAR",
  "AO_DEITAR",
] as const;

export const ALL_MOMENTOS_CLINICOS: readonly MomentoClinicoGlicemia[] = [
  ...SLOTS_MAPA_ORDER,
  "AVULSO",
] as const;

export const SLOT_META: Record<
  MomentoClinicoGlicemia,
  {
    label: string;
    shortLabel: string;
    pdfHeader: string;
    isPosPrandial: boolean;
  }
> = {
  JEJUM: {
    label: "Jejum",
    shortLabel: "Jejum",
    pdfHeader: "Jejum",
    isPosPrandial: false,
  },
  POS_CAFE: {
    label: "Pós-Café",
    shortLabel: "Pós-Café",
    pdfHeader: "Pós-Café",
    isPosPrandial: true,
  },
  PRE_ALMOCO: {
    label: "Pré-Almoço",
    shortLabel: "Pré-Alm.",
    pdfHeader: "Pré-Alm.",
    isPosPrandial: false,
  },
  POS_ALMOCO: {
    label: "Pós-Almoço",
    shortLabel: "Pós-Alm.",
    pdfHeader: "Pós-Alm.",
    isPosPrandial: true,
  },
  PRE_JANTAR: {
    label: "Pré-Jantar",
    shortLabel: "Pré-Jan.",
    pdfHeader: "Pré-Jan.",
    isPosPrandial: false,
  },
  POS_JANTAR: {
    label: "Pós-Jantar",
    shortLabel: "Pós-Jan.",
    pdfHeader: "Pós-Jan.",
    isPosPrandial: true,
  },
  AO_DEITAR: {
    label: "Ao Deitar",
    shortLabel: "Ao Deitar",
    pdfHeader: "Ao Deitar",
    isPosPrandial: false,
  },
  AVULSO: {
    label: "Avulsa",
    shortLabel: "Avulsa",
    pdfHeader: "Avulsa",
    isPosPrandial: true,
  },
};

export interface PresetProtocoloItem {
  modo: Exclude<ModoProtocoloGlicemico, "PERSONALIZADO">;
  label: string;
  descricao: string;
  slots: SlotMapaGlicemico[];
}

export const PROTOCOLO_PRESETS: readonly PresetProtocoloItem[] = [
  {
    modo: "LIVRE",
    label: "Livre",
    descricao: "Sem horários fixos obrigatórios",
    slots: [],
  },
  {
    modo: "JEJUM",
    label: "Jejum Diário (1x)",
    descricao: "1 medição matinal em jejum",
    slots: ["JEJUM"],
  },
  {
    modo: "PAREADO",
    label: "Pareado (3x)",
    descricao: "Jejum + Pós-Almoço + Pós-Jantar",
    slots: ["JEJUM", "POS_ALMOCO", "POS_JANTAR"],
  },
  {
    modo: "MAPA_COMPLETO",
    label: "Mapa Completo (6–7x)",
    descricao: "Pré e pós principais refeições + ao deitar",
    slots: [
      "JEJUM",
      "POS_CAFE",
      "PRE_ALMOCO",
      "POS_ALMOCO",
      "PRE_JANTAR",
      "POS_JANTAR",
      "AO_DEITAR",
    ],
  },
] as const;

export const SUGESTOES_INSULINA_BASAL = [
  "Lantus",
  "Tresiba",
  "Toujeo",
  "NPH",
] as const;

export const SUGESTOES_INSULINA_RAPIDA = [
  "NovoRapid",
  "Humalog",
  "Fiasp",
  "Regular",
] as const;

export const CONTEXTO_TAGS_GLICEMIA = [
  { id: "COMI_FORA", label: "Comi fora" },
  { id: "EXERCICIO", label: "Exercício" },
  { id: "SINTOMA_HIPO", label: "Sintoma de hipo" },
] as const;

export function formatContextoTagLabel(tag: string): string {
  const upper = tag.trim().toUpperCase();
  const found = CONTEXTO_TAGS_GLICEMIA.find((t) => t.id === upper);
  return found ? found.label : tag.trim();
}

export function criarProtocoloDefault(pacienteId: string): ProtocoloGlicemicoDTO {
  return {
    pacienteId,
    ativo: false,
    usaInsulina: false,
    modo: "LIVRE",
    slotsAtivos: [],
    alvoJejumMin: 70,
    alvoJejumMax: 130,
    alvoPosMax: 180,
    insulinaBasalNome: null,
    insulinaBasalDoseRef: null,
    insulinaBasalHorario: null,
    insulinaRapidaNome: null,
    orientacaoHipo: null,
    orientacaoHiper: null,
    updatedAt: null,
  };
}

export function isSlotMapa(val: string | null | undefined): val is SlotMapaGlicemico {
  if (!val) return false;
  return (SLOTS_MAPA_ORDER as readonly string[]).includes(val.trim().toUpperCase());
}

export function normalizarMomentoClinico(
  val: string | null | undefined,
): MomentoClinicoGlicemia | null {
  if (!val) return null;
  const upper = val.trim().toUpperCase();
  if ((ALL_MOMENTOS_CLINICOS as readonly string[]).includes(upper)) {
    return upper as MomentoClinicoGlicemia;
  }
  return null;
}

export function parseSlotsAtivos(raw: string | string[] | null | undefined): SlotMapaGlicemico[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  const unique = new Set<SlotMapaGlicemico>();
  for (const item of list) {
    const upper = String(item || "").trim().toUpperCase();
    if (isSlotMapa(upper)) {
      unique.add(upper);
    }
  }
  // Sempre devolve em ordem cronológica clínica
  return SLOTS_MAPA_ORDER.filter((slot) => unique.has(slot));
}

export function serializeSlotsAtivos(slots: SlotMapaGlicemico[]): string | null {
  const clean = parseSlotsAtivos(slots);
  return clean.length > 0 ? clean.join(",") : null;
}

export function parseContextoTags(raw: string | string[] | null | undefined): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const clean = String(item || "").trim().toUpperCase();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

export function serializeContextoTags(tags: string[] | null | undefined): string | null {
  const clean = parseContextoTags(tags);
  if (clean.length === 0) return null;
  return clean.join(",").slice(0, 200);
}

/**
 * Converte momento clínico granular para o enum legado (`MOMENTO`) em REGISTROS_GLICEMIA
 * garantindo 100% de retrocompatibilidade com Dashboard e consultas existentes.
 */
export function mapearMomentoClinicoParaLegado(
  momentoClinico?: MomentoClinicoGlicemia | null,
): "JEJUM" | "POS_PRANDIAL" | "CASUAL" {
  switch (momentoClinico) {
    case "JEJUM":
    case "PRE_ALMOCO":
    case "PRE_JANTAR":
      return "JEJUM";
    case "POS_CAFE":
    case "POS_ALMOCO":
    case "POS_JANTAR":
      return "POS_PRANDIAL";
    case "AO_DEITAR":
    case "AVULSO":
    default:
      return "CASUAL";
  }
}

/**
 * Infere um momento clínico para registros antigos (anteriores à migration 008)
 * ou registros enviados apenas com o campo legado `momento`.
 */
export function inferirMomentoClinico(
  momentoClinico: string | null | undefined,
  momentoLegado: string | null | undefined,
  horaBR: number,
): MomentoClinicoGlicemia {
  const explicito = normalizarMomentoClinico(momentoClinico);
  if (explicito) return explicito;

  const legado = (momentoLegado || "").trim().toUpperCase();
  if (legado === "JEJUM") {
    if (horaBR >= 11 && horaBR < 14) return "PRE_ALMOCO";
    if (horaBR >= 17 && horaBR < 21) return "PRE_JANTAR";
    return "JEJUM";
  }
  if (legado === "POS_PRANDIAL" || legado === "POS_REFEICAO" || legado === "PÓS-REFEIÇÃO") {
    if (horaBR < 11) return "POS_CAFE";
    if (horaBR < 17) return "POS_ALMOCO";
    return "POS_JANTAR";
  }
  if (horaBR >= 21 || horaBR < 4) return "AO_DEITAR";
  return "AVULSO";
}

/**
 * Classificação clínica da célula no Mapa Glicêmico:
 * - < alvoJejumMin → HIPO (rosa/vermelho)
 * - > 250 → HIPER (vermelho forte)
 * - <= alvoMaxDoMomento → ALVO (verde)
 * - entre alvoMaxDoMomento e 250 → ATENCAO (âmbar)
 */
export function classificarGlicemiaMapa(
  valor: number,
  momentoClinico: MomentoClinicoGlicemia,
  alvos: { alvoJejumMin: number; alvoJejumMax: number; alvoPosMax: number },
): StatusCelulaGlicemia {
  if (valor < alvos.alvoJejumMin) return "HIPO";
  if (valor > 250) return "HIPER";
  const maxAlvo = SLOT_META[momentoClinico].isPosPrandial
    ? alvos.alvoPosMax
    : alvos.alvoJejumMax;
  if (valor <= maxAlvo) return "ALVO";
  return "ATENCAO";
}

export function formatarUI(valor: number): string {
  const rounded = Math.round(valor * 10) / 10;
  return Number.isInteger(rounded)
    ? `${rounded} UI`
    : `${rounded.toFixed(1).replace(".", ",")} UI`;
}

export function resumirEtiquetaProtocolo(protocolo: ProtocoloGlicemicoDTO): string {
  if (!protocolo.ativo) return "Não ativado";
  const count = protocolo.slotsAtivos.length;
  if (protocolo.modo === "LIVRE" || count === 0) return "Livre";
  if (protocolo.modo === "JEJUM") return "Jejum 1x";
  if (protocolo.modo === "PAREADO") return `Pareado ${count}x`;
  if (protocolo.modo === "MAPA_COMPLETO") return `Mapa ${count}x`;
  return `Personalizado · ${count}x`;
}

export function detectarModoPorSlots(
  slots: SlotMapaGlicemico[],
): ModoProtocoloGlicemico {
  const clean = parseSlotsAtivos(slots);
  if (clean.length === 0) return "LIVRE";
  for (const preset of PROTOCOLO_PRESETS) {
    if (
      preset.slots.length === clean.length &&
      preset.slots.every((s, idx) => s === clean[idx])
    ) {
      return preset.modo;
    }
  }
  return "PERSONALIZADO";
}

const VALID_MODOS_SET: readonly ModoProtocoloGlicemico[] = [
  "LIVRE",
  "JEJUM",
  "PAREADO",
  "MAPA_COMPLETO",
  "PERSONALIZADO",
];

function toBoolFlag(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

export function serializeProtocoloGlicemico(
  pacienteId: string,
  row:
    | {
        pacienteId?: string;
        ativo?: unknown;
        usaInsulina?: unknown;
        modo?: string | null;
        slotsAtivos?: string | null;
        alvoJejumMin?: number | null;
        alvoJejumMax?: number | null;
        alvoPosMax?: number | null;
        insulinaBasalNome?: string | null;
        insulinaBasalDoseRef?: number | string | null;
        insulinaBasalHorario?: string | null;
        insulinaRapidaNome?: string | null;
        orientacaoHipo?: string | null;
        orientacaoHiper?: string | null;
        updatedAt?: Date | string | null;
      }
    | null
    | undefined,
): ProtocoloGlicemicoDTO {
  if (!row) return criarProtocoloDefault(pacienteId);

  const ativo = toBoolFlag(row.ativo);
  const usaInsulina = ativo && toBoolFlag(row.usaInsulina);
  const rawModo = String(row.modo || "LIVRE").trim().toUpperCase();
  const modo: ModoProtocoloGlicemico = (
    VALID_MODOS_SET as readonly string[]
  ).includes(rawModo)
    ? (rawModo as ModoProtocoloGlicemico)
    : "LIVRE";

  const doseRaw =
    row.insulinaBasalDoseRef !== null && row.insulinaBasalDoseRef !== undefined
      ? Number(row.insulinaBasalDoseRef)
      : null;

  let updatedAtIso: string | null = null;
  if (row.updatedAt) {
    const dt =
      row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
    if (!Number.isNaN(dt.getTime())) {
      updatedAtIso = dt.toISOString();
    }
  }

  return {
    pacienteId: row.pacienteId || pacienteId,
    ativo,
    usaInsulina,
    modo,
    slotsAtivos: parseSlotsAtivos(row.slotsAtivos),
    alvoJejumMin: Number(row.alvoJejumMin) || 70,
    alvoJejumMax: Number(row.alvoJejumMax) || 130,
    alvoPosMax: Number(row.alvoPosMax) || 180,
    insulinaBasalNome: row.insulinaBasalNome?.trim() || null,
    insulinaBasalDoseRef:
      doseRaw !== null && Number.isFinite(doseRaw) && doseRaw > 0
        ? Math.round(doseRaw * 100) / 100
        : null,
    insulinaBasalHorario: row.insulinaBasalHorario?.trim() || null,
    insulinaRapidaNome: row.insulinaRapidaNome?.trim() || null,
    orientacaoHipo: row.orientacaoHipo?.trim() || null,
    orientacaoHiper: row.orientacaoHiper?.trim() || null,
    updatedAt: updatedAtIso,
  };
}
