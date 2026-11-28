// ============================================================================
// CATÁLOGO MÉDICO COMPLETO & MOTOR CLÍNICO DE EXAMES LABORATORIAIS — FRdoc 2.0
// ============================================================================
// • 12 grupos clínicos (~125 exames + 7 laudos de imagem/complementares)
// • Busca ultra-rápida sem acento com ordenação por prioridade clínica
// • Trava de plausibilidade fisiológica para evitar troca acidental de exame
// • 4 cálculos automáticos em tempo real (HOMA-IR, HOMA-Beta, Não-HDL, TG/HDL)
// • Motor puro de avaliação de evolução clínica (melhora / piora / estável)
// ============================================================================

export type ExamCategoryId =
  | "glicemico"
  | "lipidico"
  | "tireoide"
  | "osseo"
  | "hormonios_sexuais"
  | "adrenal_hipofise"
  | "hemograma_ferro"
  | "vitaminas_minerais"
  | "figado_pancreas"
  | "rins_eletrolitos"
  | "inflamacao_imunidade"
  | "imagem_laudos";

export type ClinicalDirection =
  | "lower_better"
  | "higher_better"
  | "range_optimal";

export type ExamValueType = "number" | "text";

export interface ExamCategoryDef {
  id: ExamCategoryId;
  label: string;
  shortLabel: string;
  order: number;
}

export interface ExamDef {
  key: string;
  label: string;
  shortLabel?: string;
  category: ExamCategoryId;
  priority: number;
  aliases: string[];
  unit: string;
  type: ExamValueType;
  refMin?: number;
  refMax?: number;
  refLabel: string;
  plausibleMin?: number;
  plausibleMax?: number;
  clinicalDirection: ClinicalDirection;
  decimals?: number;
  isCalculated?: boolean;
}

export interface LaudoImagemDef {
  key: string;
  label: string;
  placeholder: string;
}

export interface ExamePersonalizadoDTO {
  nome: string;
  valor: string | number;
  unidade?: string;
  referencia?: string;
}

export interface ExameLaboratorialDTO {
  id: string;
  organizacaoId: string;
  pacienteId: string;
  medicoId: string | null;
  dataColeta: string; // YYYY-MM-DD
  laboratorio: string | null;
  valores: Record<string, number | string>;
  examesPersonalizados: ExamePersonalizadoDTO[];
  laudosImagem: Record<string, string>;
  observacoes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type ExamStatus = "ok" | "high" | "low";
export type ExamTrend = "improved" | "worsened" | "stable" | "none";

export interface ExamEvolutionResult {
  status: ExamStatus;
  trend: ExamTrend;
  delta: number | null;
  percentChange: number | null;
  deltaFormatted: string | null;
  arrow: "↑" | "↓" | "→" | null;
  badgeLabel: "Melhorou" | "Atenção" | "Estável" | null;
  needsAttention: boolean;
}

export interface ExamRoutineDef {
  id: string;
  label: string;
  description: string;
  keys: string[];
}

// ============================================================================
// 1. OS 12 GRUPOS CLÍNICOS
// ============================================================================

export const EXAM_CATEGORIES: ExamCategoryDef[] = [
  { id: "glicemico", label: "Glicêmico & Carboidratos", shortLabel: "Glicêmico", order: 1 },
  { id: "lipidico", label: "Perfil Lipídico & Cardiovascular", shortLabel: "Lipídico", order: 2 },
  { id: "tireoide", label: "Tireoide", shortLabel: "Tireoide", order: 3 },
  { id: "osseo", label: "Metabolismo Ósseo & Cálcio", shortLabel: "Ósseo & Cálcio", order: 4 },
  { id: "hormonios_sexuais", label: "Hormônios Sexuais & Fertilidade", shortLabel: "Hormônios", order: 5 },
  { id: "adrenal_hipofise", label: "Adrenal & Hipófise", shortLabel: "Adrenal", order: 6 },
  { id: "hemograma_ferro", label: "Hemograma & Cinética do Ferro", shortLabel: "Hemograma & Ferro", order: 7 },
  { id: "vitaminas_minerais", label: "Vitaminas & Minerais (Nutrologia)", shortLabel: "Vitaminas", order: 8 },
  { id: "figado_pancreas", label: "Fígado, Vias Biliares & Pâncreas", shortLabel: "Fígado & Pâncreas", order: 9 },
  { id: "rins_eletrolitos", label: "Rins, Eletrólitos & Urina", shortLabel: "Rins & Urina", order: 10 },
  { id: "inflamacao_imunidade", label: "Inflamação, Imunidade, Intestino & Coagulação", shortLabel: "Inflamação", order: 11 },
  { id: "imagem_laudos", label: "Imagem & Laudos Complementares", shortLabel: "Imagem & Laudos", order: 12 },
];

export const EXAM_CATEGORY_MAP: Record<ExamCategoryId, ExamCategoryDef> =
  EXAM_CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat.id] = cat;
      return acc;
    },
    {} as Record<ExamCategoryId, ExamCategoryDef>,
  );

// ============================================================================
// 2. CATÁLOGO LABORATORIAL COMPLETO (125 EXAMES)
// ============================================================================

export const EXAM_CATALOG: ExamDef[] = [
  // --------------------------------------------------------------------------
  // GRUPO 1: Glicêmico & Carboidratos (11)
  // --------------------------------------------------------------------------
  {
    key: "glicemia_jejum",
    label: "Glicemia de Jejum",
    shortLabel: "Glic",
    category: "glicemico",
    priority: 100,
    aliases: ["glic", "gj", "gli", "glicose", "glicemia", "glicemia jejum", "glicose jejum"],
    unit: "mg/dL",
    type: "number",
    refMin: 70,
    refMax: 99,
    refLabel: "70 – 99 mg/dL",
    plausibleMin: 25,
    plausibleMax: 800,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "hba1c",
    label: "Hemoglobina Glicada (HbA1c)",
    shortLabel: "HbA1c",
    category: "glicemico",
    priority: 95,
    aliases: ["a1c", "hba1c", "glicada", "gli", "glic", "hemoglobina glicada", "hg"],
    unit: "%",
    type: "number",
    refMin: 4.0,
    refMax: 5.7,
    refLabel: "≤ 5,7%",
    plausibleMin: 3,
    plausibleMax: 20,
    clinicalDirection: "lower_better",
    decimals: 1,
  },
  {
    key: "glicemia_pos_prandial",
    label: "Glicemia Pós-Prandial",
    shortLabel: "Glic PP",
    category: "glicemico",
    priority: 82,
    aliases: ["gpp", "gli", "glic", "glicemia pos", "pos prandial", "glicose pos"],
    unit: "mg/dL",
    type: "number",
    refMin: 70,
    refMax: 140,
    refLabel: "< 140 mg/dL",
    plausibleMin: 30,
    plausibleMax: 900,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "insulina_basal",
    label: "Insulina Basal",
    shortLabel: "Insulina",
    category: "glicemico",
    priority: 92,
    aliases: ["ins", "insulina", "insulina jejum", "insul"],
    unit: "µUI/mL",
    type: "number",
    refMin: 2.0,
    refMax: 10.0,
    refLabel: "2,0 – 10,0 µUI/mL",
    plausibleMin: 0.5,
    plausibleMax: 400,
    clinicalDirection: "lower_better",
    decimals: 1,
  },
  {
    key: "totg_jejum",
    label: "TOTG — Jejum",
    shortLabel: "TOTG 0'",
    category: "glicemico",
    priority: 58,
    aliases: ["totg", "totg jejum", "curva glicemica jejum", "ttog"],
    unit: "mg/dL",
    type: "number",
    refMin: 70,
    refMax: 99,
    refLabel: "< 100 mg/dL",
    plausibleMin: 25,
    plausibleMax: 600,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "totg_60",
    label: "TOTG — 60 min",
    shortLabel: "TOTG 60'",
    category: "glicemico",
    priority: 54,
    aliases: ["totg 60", "totg 1h", "curva 60"],
    unit: "mg/dL",
    type: "number",
    refMin: 70,
    refMax: 180,
    refLabel: "< 180 mg/dL",
    plausibleMin: 30,
    plausibleMax: 800,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "totg_120",
    label: "TOTG — 120 min",
    shortLabel: "TOTG 120'",
    category: "glicemico",
    priority: 56,
    aliases: ["totg 120", "totg 2h", "curva 120"],
    unit: "mg/dL",
    type: "number",
    refMin: 70,
    refMax: 140,
    refLabel: "< 140 mg/dL",
    plausibleMin: 30,
    plausibleMax: 800,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "frutosamina",
    label: "Frutosamina",
    category: "glicemico",
    priority: 48,
    aliases: ["fruto", "frutosam"],
    unit: "µmol/L",
    type: "number",
    refMin: 205,
    refMax: 285,
    refLabel: "205 – 285 µmol/L",
    plausibleMin: 80,
    plausibleMax: 900,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "peptideo_c",
    label: "Peptídeo C",
    category: "glicemico",
    priority: 62,
    aliases: ["peptideo c", "c peptideo", "pepc"],
    unit: "ng/mL",
    type: "number",
    refMin: 1.1,
    refMax: 4.4,
    refLabel: "1,1 – 4,4 ng/mL",
    plausibleMin: 0.05,
    plausibleMax: 30,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "anti_gad",
    label: "Anti-GAD",
    category: "glicemico",
    priority: 46,
    aliases: ["antigad", "gad", "anti gad"],
    unit: "U/mL",
    type: "number",
    refMin: 0,
    refMax: 5,
    refLabel: "< 5,0 U/mL",
    plausibleMin: 0,
    plausibleMax: 5000,
    clinicalDirection: "lower_better",
    decimals: 1,
  },
  {
    key: "anti_ilhota",
    label: "Anti-Ilhota (ICA)",
    category: "glicemico",
    priority: 42,
    aliases: ["ica", "anti ilhota", "ilhota"],
    unit: "",
    type: "text",
    refLabel: "Não reagente",
    clinicalDirection: "range_optimal",
  },

  // --------------------------------------------------------------------------
  // GRUPO 2: Perfil Lipídico & Cardiovascular (11)
  // --------------------------------------------------------------------------
  {
    key: "colesterol_total",
    label: "Colesterol Total",
    shortLabel: "CT",
    category: "lipidico",
    priority: 95,
    aliases: ["ct", "colesterol", "col total", "colest"],
    unit: "mg/dL",
    type: "number",
    refMin: 0,
    refMax: 190,
    refLabel: "< 190 mg/dL",
    plausibleMin: 50,
    plausibleMax: 1000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "ldl",
    label: "LDL-Colesterol",
    shortLabel: "LDL",
    category: "lipidico",
    priority: 94,
    aliases: ["ldl", "ldl-c", "colesterol ldl", "ldlc"],
    unit: "mg/dL",
    type: "number",
    refMin: 0,
    refMax: 100,
    refLabel: "< 100 mg/dL",
    plausibleMin: 10,
    plausibleMax: 700,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "hdl",
    label: "HDL-Colesterol",
    shortLabel: "HDL",
    category: "lipidico",
    priority: 93,
    aliases: ["hdl", "hdl-c", "colesterol hdl", "hdlc"],
    unit: "mg/dL",
    type: "number",
    refMin: 50,
    refMax: 120,
    refLabel: "> 50 mg/dL",
    plausibleMin: 10,
    plausibleMax: 200,
    clinicalDirection: "higher_better",
    decimals: 0,
  },
  {
    key: "vldl",
    label: "VLDL-Colesterol",
    shortLabel: "VLDL",
    category: "lipidico",
    priority: 70,
    aliases: ["vldl", "vldl-c"],
    unit: "mg/dL",
    type: "number",
    refMin: 0,
    refMax: 30,
    refLabel: "< 30 mg/dL",
    plausibleMin: 2,
    plausibleMax: 300,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "triglicerideos",
    label: "Triglicerídeos",
    shortLabel: "TG",
    category: "lipidico",
    priority: 92,
    aliases: ["tg", "trig", "triglicerideos", "triglicerides", "trigliceridios"],
    unit: "mg/dL",
    type: "number",
    refMin: 0,
    refMax: 150,
    refLabel: "< 150 mg/dL",
    plausibleMin: 15,
    plausibleMax: 5000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "apo_a1",
    label: "Apolipoproteína A1 (ApoA1)",
    shortLabel: "ApoA1",
    category: "lipidico",
    priority: 64,
    aliases: ["apoa1", "apo a1", "apolipoproteina a1"],
    unit: "mg/dL",
    type: "number",
    refMin: 120,
    refMax: 220,
    refLabel: "> 120 mg/dL",
    plausibleMin: 30,
    plausibleMax: 400,
    clinicalDirection: "higher_better",
    decimals: 0,
  },
  {
    key: "apo_b",
    label: "Apolipoproteína B (ApoB)",
    shortLabel: "ApoB",
    category: "lipidico",
    priority: 76,
    aliases: ["apob", "apo b", "apolipoproteina b"],
    unit: "mg/dL",
    type: "number",
    refMin: 0,
    refMax: 90,
    refLabel: "< 90 mg/dL",
    plausibleMin: 20,
    plausibleMax: 400,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "lpa",
    label: "Lipoproteína (a) — Lp(a)",
    shortLabel: "Lp(a)",
    category: "lipidico",
    priority: 72,
    aliases: ["lpa", "lp(a)", "lipoproteina a"],
    unit: "nmol/L",
    type: "number",
    refMin: 0,
    refMax: 75,
    refLabel: "< 75 nmol/L",
    plausibleMin: 0,
    plausibleMax: 1000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "homocisteina",
    label: "Homocisteína",
    shortLabel: "Hcy",
    category: "lipidico",
    priority: 74,
    aliases: ["hcy", "homocist", "homocisteina"],
    unit: "µmol/L",
    type: "number",
    refMin: 5,
    refMax: 10,
    refLabel: "< 10 µmol/L",
    plausibleMin: 1,
    plausibleMax: 150,
    clinicalDirection: "lower_better",
    decimals: 1,
  },
  {
    key: "fibrinogenio",
    label: "Fibrinogênio",
    category: "lipidico",
    priority: 55,
    aliases: ["fibrinog", "fibrinogenio"],
    unit: "mg/dL",
    type: "number",
    refMin: 200,
    refMax: 400,
    refLabel: "200 – 400 mg/dL",
    plausibleMin: 50,
    plausibleMax: 1200,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "cpk",
    label: "CPK (Creatinofosfoquinase)",
    shortLabel: "CPK",
    category: "lipidico",
    priority: 68,
    aliases: ["cpk", "ck", "creatinoquinase"],
    unit: "U/L",
    type: "number",
    refMin: 20,
    refMax: 170,
    refLabel: "20 – 170 U/L",
    plausibleMin: 5,
    plausibleMax: 50000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },

  // --------------------------------------------------------------------------
  // GRUPO 3: Tireoide (11)
  // --------------------------------------------------------------------------
  {
    key: "tsh",
    label: "TSH",
    shortLabel: "TSH",
    category: "tireoide",
    priority: 100,
    aliases: ["tsh", "tsh ultra", "tireotropina"],
    unit: "µUI/mL",
    type: "number",
    refMin: 0.4,
    refMax: 4.0,
    refLabel: "0,40 – 4,00 µUI/mL",
    plausibleMin: 0.005,
    plausibleMax: 150,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "t4_livre",
    label: "T4 Livre",
    shortLabel: "T4L",
    category: "tireoide",
    priority: 96,
    aliases: ["t4l", "t4", "t4 livre", "ft4", "tiroxina livre"],
    unit: "ng/dL",
    type: "number",
    refMin: 0.8,
    refMax: 1.8,
    refLabel: "0,80 – 1,80 ng/dL",
    plausibleMin: 0.1,
    plausibleMax: 12,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "t4_total",
    label: "T4 Total",
    shortLabel: "T4T",
    category: "tireoide",
    priority: 60,
    aliases: ["t4t", "t4", "t4 total", "tiroxina total"],
    unit: "µg/dL",
    type: "number",
    refMin: 4.5,
    refMax: 12.0,
    refLabel: "4,5 – 12,0 µg/dL",
    plausibleMin: 0.5,
    plausibleMax: 35,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "t3_livre",
    label: "T3 Livre",
    shortLabel: "T3L",
    category: "tireoide",
    priority: 92,
    aliases: ["t3l", "t3", "t3 livre", "ft3"],
    unit: "pg/mL",
    type: "number",
    refMin: 2.0,
    refMax: 4.4,
    refLabel: "2,0 – 4,4 pg/mL",
    plausibleMin: 0.4,
    plausibleMax: 30,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "t3_total",
    label: "T3 Total",
    shortLabel: "T3T",
    category: "tireoide",
    priority: 65,
    aliases: ["t3t", "t3", "t3 total"],
    unit: "ng/dL",
    type: "number",
    refMin: 80,
    refMax: 200,
    refLabel: "80 – 200 ng/dL",
    plausibleMin: 15,
    plausibleMax: 800,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "t3_reverso",
    label: "T3 Reverso",
    shortLabel: "T3r",
    category: "tireoide",
    priority: 55,
    aliases: ["t3r", "rt3", "t3", "t3 reverso"],
    unit: "ng/dL",
    type: "number",
    refMin: 9.0,
    refMax: 24.0,
    refLabel: "9,0 – 24,0 ng/dL",
    plausibleMin: 1,
    plausibleMax: 150,
    clinicalDirection: "lower_better",
    decimals: 1,
  },
  {
    key: "anti_tpo",
    label: "Anti-TPO",
    shortLabel: "Anti-TPO",
    category: "tireoide",
    priority: 85,
    aliases: ["atpo", "antitpo", "anti tpo", "antiperoxidase"],
    unit: "UI/mL",
    type: "number",
    refMin: 0,
    refMax: 34,
    refLabel: "< 34 UI/mL",
    plausibleMin: 0,
    plausibleMax: 10000,
    clinicalDirection: "lower_better",
    decimals: 1,
  },
  {
    key: "anti_tg",
    label: "Anti-Tireoglobulina (Anti-Tg)",
    shortLabel: "Anti-Tg",
    category: "tireoide",
    priority: 80,
    aliases: ["atg", "antitg", "anti tg", "antitireoglobulina"],
    unit: "UI/mL",
    type: "number",
    refMin: 0,
    refMax: 115,
    refLabel: "< 115 UI/mL",
    plausibleMin: 0,
    plausibleMax: 10000,
    clinicalDirection: "lower_better",
    decimals: 1,
  },
  {
    key: "trab",
    label: "TRAb",
    shortLabel: "TRAb",
    category: "tireoide",
    priority: 70,
    aliases: ["trab", "anti receptor tsh"],
    unit: "UI/L",
    type: "number",
    refMin: 0,
    refMax: 1.75,
    refLabel: "< 1,75 UI/L",
    plausibleMin: 0,
    plausibleMax: 200,
    clinicalDirection: "lower_better",
    decimals: 2,
  },
  {
    key: "tireoglobulina",
    label: "Tireoglobulina",
    category: "tireoide",
    priority: 65,
    aliases: ["tireog", "tireoglobulina"],
    unit: "ng/mL",
    type: "number",
    refMin: 1.4,
    refMax: 78.0,
    refLabel: "1,4 – 78,0 ng/mL",
    plausibleMin: 0,
    plausibleMax: 5000,
    clinicalDirection: "lower_better",
    decimals: 1,
  },
  {
    key: "calcitonina",
    label: "Calcitonina",
    category: "tireoide",
    priority: 55,
    aliases: ["calcit", "calcitonina"],
    unit: "pg/mL",
    type: "number",
    refMin: 0,
    refMax: 10,
    refLabel: "< 10 pg/mL",
    plausibleMin: 0,
    plausibleMax: 5000,
    clinicalDirection: "lower_better",
    decimals: 1,
  },

  // --------------------------------------------------------------------------
  // GRUPO 4: Metabolismo Ósseo & Cálcio (8)
  // --------------------------------------------------------------------------
  {
    key: "pth",
    label: "PTH (Paratormônio)",
    shortLabel: "PTH",
    category: "osseo",
    priority: 85,
    aliases: ["pth", "paratormonio", "pth intacto"],
    unit: "pg/mL",
    type: "number",
    refMin: 15,
    refMax: 65,
    refLabel: "15 – 65 pg/mL",
    plausibleMin: 1,
    plausibleMax: 2000,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "calcio_total",
    label: "Cálcio Total",
    shortLabel: "Ca",
    category: "osseo",
    priority: 82,
    aliases: ["ca", "calcio", "ca total", "calcio total"],
    unit: "mg/dL",
    type: "number",
    refMin: 8.6,
    refMax: 10.2,
    refLabel: "8,6 – 10,2 mg/dL",
    plausibleMin: 4.0,
    plausibleMax: 18.0,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "calcio_ionico",
    label: "Cálcio Iônico",
    shortLabel: "Ca²⁺",
    category: "osseo",
    priority: 75,
    aliases: ["cai", "ca ionico", "calcio ionizado", "calcio ionico"],
    unit: "mmol/L",
    type: "number",
    refMin: 1.12,
    refMax: 1.32,
    refLabel: "1,12 – 1,32 mmol/L",
    plausibleMin: 0.5,
    plausibleMax: 2.5,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "fosforo",
    label: "Fósforo",
    shortLabel: "P",
    category: "osseo",
    priority: 70,
    aliases: ["fosforo", "fosfato", "p"],
    unit: "mg/dL",
    type: "number",
    refMin: 2.5,
    refMax: 4.5,
    refLabel: "2,5 – 4,5 mg/dL",
    plausibleMin: 0.5,
    plausibleMax: 15.0,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "magnesio",
    label: "Magnésio",
    shortLabel: "Mg",
    category: "osseo",
    priority: 78,
    aliases: ["mg", "mag", "magnesio"],
    unit: "mg/dL",
    type: "number",
    refMin: 1.8,
    refMax: 2.5,
    refLabel: "1,8 – 2,5 mg/dL",
    plausibleMin: 0.5,
    plausibleMax: 8.0,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "ctx",
    label: "CTX (C-Telopeptídeo)",
    shortLabel: "CTX",
    category: "osseo",
    priority: 60,
    aliases: ["ctx", "beta ctx", "telopeptideo"],
    unit: "ng/mL",
    type: "number",
    refMin: 0.1,
    refMax: 0.58,
    refLabel: "0,10 – 0,58 ng/mL",
    plausibleMin: 0.01,
    plausibleMax: 5.0,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "osteocalcina",
    label: "Osteocalcina",
    category: "osseo",
    priority: 50,
    aliases: ["osteocalc", "osteocalcina"],
    unit: "ng/mL",
    type: "number",
    refMin: 11,
    refMax: 43,
    refLabel: "11 – 43 ng/mL",
    plausibleMin: 1,
    plausibleMax: 300,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "calciuria_24h",
    label: "Calciúria de 24h",
    category: "osseo",
    priority: 55,
    aliases: ["calciuria", "calcio 24h", "calcio urinario"],
    unit: "mg/24h",
    type: "number",
    refMin: 100,
    refMax: 250,
    refLabel: "100 – 250 mg/24h",
    plausibleMin: 5,
    plausibleMax: 1500,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },

  // --------------------------------------------------------------------------
  // GRUPO 5: Hormônios Sexuais & Fertilidade (15)
  // --------------------------------------------------------------------------
  {
    key: "testosterona_total",
    label: "Testosterona Total",
    shortLabel: "Testo T",
    category: "hormonios_sexuais",
    priority: 96,
    aliases: ["testo", "tt", "testo total", "testosterona"],
    unit: "ng/dL",
    type: "number",
    refMin: 15,
    refMax: 800,
    refLabel: "M: 250–800 | F: 15–70 ng/dL",
    plausibleMin: 1,
    plausibleMax: 3000,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "testosterona_livre",
    label: "Testosterona Livre",
    shortLabel: "Testo L",
    category: "hormonios_sexuais",
    priority: 90,
    aliases: ["testo", "tl", "testo livre", "testosterona livre"],
    unit: "ng/dL",
    type: "number",
    refMin: 0.2,
    refMax: 25,
    refLabel: "M: 6,5–25 | F: 0,2–1,2 ng/dL",
    plausibleMin: 0.01,
    plausibleMax: 200,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "testosterona_biodisponivel",
    label: "Testosterona Biodisponível",
    shortLabel: "Testo Bio",
    category: "hormonios_sexuais",
    priority: 65,
    aliases: ["testo", "testo bio", "biodisponivel"],
    unit: "ng/dL",
    type: "number",
    refMin: 10,
    refMax: 450,
    refLabel: "M: 110–450 | F: 3–30 ng/dL",
    plausibleMin: 0.5,
    plausibleMax: 1500,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "shbg",
    label: "SHBG",
    shortLabel: "SHBG",
    category: "hormonios_sexuais",
    priority: 85,
    aliases: ["shbg", "globulina ligadora"],
    unit: "nmol/L",
    type: "number",
    refMin: 18,
    refMax: 114,
    refLabel: "18 – 114 nmol/L",
    plausibleMin: 2,
    plausibleMax: 400,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "estradiol",
    label: "Estradiol (E2)",
    shortLabel: "E2",
    category: "hormonios_sexuais",
    priority: 90,
    aliases: ["e2", "estradiol", "estrogeno"],
    unit: "pg/mL",
    type: "number",
    refMin: 15,
    refMax: 350,
    refLabel: "15 – 350 pg/mL (fase)",
    plausibleMin: 2,
    plausibleMax: 3000,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "progesterona",
    label: "Progesterona",
    shortLabel: "Prog",
    category: "hormonios_sexuais",
    priority: 82,
    aliases: ["p4", "prog", "progesterona"],
    unit: "ng/mL",
    type: "number",
    refMin: 0.2,
    refMax: 25,
    refLabel: "0,2 – 25,0 ng/mL (fase)",
    plausibleMin: 0.05,
    plausibleMax: 300,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "lh",
    label: "LH",
    shortLabel: "LH",
    category: "hormonios_sexuais",
    priority: 84,
    aliases: ["lh", "luteinizante"],
    unit: "mUI/mL",
    type: "number",
    refMin: 1.5,
    refMax: 12.5,
    refLabel: "1,5 – 12,5 mUI/mL",
    plausibleMin: 0.05,
    plausibleMax: 200,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "fsh",
    label: "FSH",
    shortLabel: "FSH",
    category: "hormonios_sexuais",
    priority: 83,
    aliases: ["fsh", "foliculo estimulante"],
    unit: "mUI/mL",
    type: "number",
    refMin: 1.5,
    refMax: 12.5,
    refLabel: "1,5 – 12,5 mUI/mL",
    plausibleMin: 0.05,
    plausibleMax: 250,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "prolactina",
    label: "Prolactina",
    shortLabel: "PRL",
    category: "hormonios_sexuais",
    priority: 86,
    aliases: ["prl", "prolactina", "prolact"],
    unit: "ng/mL",
    type: "number",
    refMin: 4.0,
    refMax: 25.0,
    refLabel: "4,0 – 25,0 ng/mL",
    plausibleMin: 0.5,
    plausibleMax: 2000,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "dht",
    label: "DHT (Di-hidrotestosterona)",
    shortLabel: "DHT",
    category: "hormonios_sexuais",
    priority: 68,
    aliases: ["dht", "diidrotestosterona"],
    unit: "pg/mL",
    type: "number",
    refMin: 24,
    refMax: 990,
    refLabel: "F: 24–368 | M: 250–990 pg/mL",
    plausibleMin: 5,
    plausibleMax: 5000,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "androstenediona",
    label: "Androstenediona",
    category: "hormonios_sexuais",
    priority: 62,
    aliases: ["andro", "delta4", "androstenediona"],
    unit: "ng/mL",
    type: "number",
    refMin: 0.4,
    refMax: 3.4,
    refLabel: "0,4 – 3,4 ng/mL",
    plausibleMin: 0.05,
    plausibleMax: 30,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "amh",
    label: "AMH (Hormônio Anti-Mülleriano)",
    shortLabel: "AMH",
    category: "hormonios_sexuais",
    priority: 70,
    aliases: ["amh", "ham", "antimulleriano"],
    unit: "ng/mL",
    type: "number",
    refMin: 1.0,
    refMax: 4.0,
    refLabel: "1,0 – 4,0 ng/mL",
    plausibleMin: 0.01,
    plausibleMax: 30,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "beta_hcg",
    label: "Beta-hCG Quantitativo",
    shortLabel: "β-hCG",
    category: "hormonios_sexuais",
    priority: 72,
    aliases: ["bhcg", "hcg", "beta hcg", "beta"],
    unit: "mUI/mL",
    type: "number",
    refMin: 0,
    refMax: 5,
    refLabel: "< 5,0 mUI/mL (não gest.)",
    plausibleMin: 0,
    plausibleMax: 500000,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "psa_total",
    label: "PSA Total",
    shortLabel: "PSA",
    category: "hormonios_sexuais",
    priority: 80,
    aliases: ["psa", "psa total"],
    unit: "ng/mL",
    type: "number",
    refMin: 0,
    refMax: 4.0,
    refLabel: "< 4,0 ng/mL",
    plausibleMin: 0,
    plausibleMax: 500,
    clinicalDirection: "lower_better",
    decimals: 2,
  },
  {
    key: "psa_livre",
    label: "PSA Livre",
    shortLabel: "PSA L",
    category: "hormonios_sexuais",
    priority: 70,
    aliases: ["psal", "psa livre"],
    unit: "ng/mL",
    type: "number",
    refMin: 0,
    refMax: 1.0,
    refLabel: "Relação Livre/Total > 20%",
    plausibleMin: 0,
    plausibleMax: 200,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },

  // --------------------------------------------------------------------------
  // GRUPO 6: Adrenal & Hipófise (10)
  // --------------------------------------------------------------------------
  {
    key: "cortisol_basal",
    label: "Cortisol Basal (8h)",
    shortLabel: "Cortisol",
    category: "adrenal_hipofise",
    priority: 88,
    aliases: ["cortisol", "cortisol manha", "cortisol 8h", "cortisol basal"],
    unit: "µg/dL",
    type: "number",
    refMin: 6.2,
    refMax: 19.4,
    refLabel: "6,2 – 19,4 µg/dL",
    plausibleMin: 0.3,
    plausibleMax: 120,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "cortisol_salivar",
    label: "Cortisol Salivar Noturno",
    category: "adrenal_hipofise",
    priority: 65,
    aliases: ["cortisol salivar", "cortisol saliva", "cortisol 23h"],
    unit: "ng/dL",
    type: "number",
    refMin: 0,
    refMax: 100,
    refLabel: "< 100 ng/dL",
    plausibleMin: 1,
    plausibleMax: 5000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "cortisol_urinario_24h",
    label: "Cortisol Livre Urinário 24h",
    category: "adrenal_hipofise",
    priority: 60,
    aliases: ["clu", "cortisol 24h", "cortisol urinario"],
    unit: "µg/24h",
    type: "number",
    refMin: 4.3,
    refMax: 176,
    refLabel: "4,3 – 176 µg/24h",
    plausibleMin: 1,
    plausibleMax: 2000,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "acth",
    label: "ACTH",
    shortLabel: "ACTH",
    category: "adrenal_hipofise",
    priority: 75,
    aliases: ["acth", "adrenocorticotrofico"],
    unit: "pg/mL",
    type: "number",
    refMin: 7.2,
    refMax: 63.3,
    refLabel: "7,2 – 63,3 pg/mL",
    plausibleMin: 1,
    plausibleMax: 2000,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "sdhea",
    label: "S-DHEA (DHEA-S)",
    shortLabel: "S-DHEA",
    category: "adrenal_hipofise",
    priority: 82,
    aliases: ["sdhea", "dheas", "dhea-s", "s-dhea", "dhea"],
    unit: "µg/dL",
    type: "number",
    refMin: 60,
    refMax: 380,
    refLabel: "60 – 380 µg/dL",
    plausibleMin: 5,
    plausibleMax: 2000,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "hidroxiprogesterona_17",
    label: "17-OH-Progesterona",
    shortLabel: "17-OHP",
    category: "adrenal_hipofise",
    priority: 70,
    aliases: ["17ohp", "17-ohp", "17oh", "17 oh progesterona"],
    unit: "ng/dL",
    type: "number",
    refMin: 15,
    refMax: 200,
    refLabel: "< 200 ng/dL",
    plausibleMin: 1,
    plausibleMax: 10000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "gh",
    label: "GH (Hormônio do Crescimento)",
    shortLabel: "GH",
    category: "adrenal_hipofise",
    priority: 68,
    aliases: ["gh", "somatotrofina", "hormonio crescimento"],
    unit: "ng/mL",
    type: "number",
    refMin: 0.05,
    refMax: 5.0,
    refLabel: "< 5,0 ng/mL",
    plausibleMin: 0.01,
    plausibleMax: 100,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "igf1",
    label: "IGF-1 (Somatomedina C)",
    shortLabel: "IGF-1",
    category: "adrenal_hipofise",
    priority: 80,
    aliases: ["igf1", "igf-1", "somatomedina"],
    unit: "ng/mL",
    type: "number",
    refMin: 80,
    refMax: 280,
    refLabel: "80 – 280 ng/mL (idade)",
    plausibleMin: 10,
    plausibleMax: 1500,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "aldosterona",
    label: "Aldosterona",
    shortLabel: "Aldo",
    category: "adrenal_hipofise",
    priority: 72,
    aliases: ["aldo", "aldosterona"],
    unit: "ng/dL",
    type: "number",
    refMin: 2.5,
    refMax: 31.5,
    refLabel: "2,5 – 31,5 ng/dL",
    plausibleMin: 0.5,
    plausibleMax: 500,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "renina",
    label: "Renina (Atividade Plasmática)",
    shortLabel: "Renina",
    category: "adrenal_hipofise",
    priority: 70,
    aliases: ["renina", "apr"],
    unit: "ng/mL/h",
    type: "number",
    refMin: 0.5,
    refMax: 4.0,
    refLabel: "0,5 – 4,0 ng/mL/h",
    plausibleMin: 0.05,
    plausibleMax: 100,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },

  // --------------------------------------------------------------------------
  // GRUPO 7: Hemograma & Cinética do Ferro (14)
  // --------------------------------------------------------------------------
  {
    key: "hemoglobina",
    label: "Hemoglobina",
    shortLabel: "Hb",
    category: "hemograma_ferro",
    priority: 94,
    aliases: ["hb", "hgb", "hemo", "hemoglobina"],
    unit: "g/dL",
    type: "number",
    refMin: 12.0,
    refMax: 16.5,
    refLabel: "12,0 – 16,5 g/dL",
    plausibleMin: 3.0,
    plausibleMax: 24.0,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "hematocrito",
    label: "Hematócrito",
    shortLabel: "Ht",
    category: "hemograma_ferro",
    priority: 88,
    aliases: ["ht", "hct", "hematocrito"],
    unit: "%",
    type: "number",
    refMin: 36,
    refMax: 49,
    refLabel: "36 – 49%",
    plausibleMin: 10,
    plausibleMax: 75,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "hemacias",
    label: "Hemácias",
    category: "hemograma_ferro",
    priority: 75,
    aliases: ["rbc", "eritrocitos", "hemacias"],
    unit: "M/mm³",
    type: "number",
    refMin: 4.0,
    refMax: 5.5,
    refLabel: "4,0 – 5,5 M/mm³",
    plausibleMin: 1.0,
    plausibleMax: 9.0,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "vcm",
    label: "VCM",
    shortLabel: "VCM",
    category: "hemograma_ferro",
    priority: 72,
    aliases: ["vcm"],
    unit: "fL",
    type: "number",
    refMin: 80,
    refMax: 100,
    refLabel: "80 – 100 fL",
    plausibleMin: 45,
    plausibleMax: 140,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "hcm",
    label: "HCM",
    shortLabel: "HCM",
    category: "hemograma_ferro",
    priority: 68,
    aliases: ["hcm"],
    unit: "pg",
    type: "number",
    refMin: 27,
    refMax: 33,
    refLabel: "27 – 33 pg",
    plausibleMin: 12,
    plausibleMax: 50,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "rdw",
    label: "RDW",
    shortLabel: "RDW",
    category: "hemograma_ferro",
    priority: 74,
    aliases: ["rdw"],
    unit: "%",
    type: "number",
    refMin: 11.5,
    refMax: 14.5,
    refLabel: "11,5 – 14,5%",
    plausibleMin: 8,
    plausibleMax: 35,
    clinicalDirection: "lower_better",
    decimals: 1,
  },
  {
    key: "leucocitos",
    label: "Leucócitos",
    shortLabel: "Leuco",
    category: "hemograma_ferro",
    priority: 86,
    aliases: ["leuco", "wbc", "leucocitos", "globulos brancos"],
    unit: "/mm³",
    type: "number",
    refMin: 4000,
    refMax: 10000,
    refLabel: "4.000 – 10.000 /mm³",
    plausibleMin: 500,
    plausibleMax: 150000,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "plaquetas",
    label: "Plaquetas",
    shortLabel: "Plaq",
    category: "hemograma_ferro",
    priority: 85,
    aliases: ["plaq", "plt", "plaquetas"],
    unit: "/mm³",
    type: "number",
    refMin: 150000,
    refMax: 450000,
    refLabel: "150.000 – 450.000 /mm³",
    plausibleMin: 5000,
    plausibleMax: 2000000,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "reticulocitos",
    label: "Reticulócitos",
    category: "hemograma_ferro",
    priority: 60,
    aliases: ["retic", "reticulocitos"],
    unit: "%",
    type: "number",
    refMin: 0.5,
    refMax: 2.0,
    refLabel: "0,5 – 2,0%",
    plausibleMin: 0.05,
    plausibleMax: 25,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "ferritina",
    label: "Ferritina",
    shortLabel: "Ferritina",
    category: "hemograma_ferro",
    priority: 96,
    aliases: ["ferr", "ferrit", "ferritina"],
    unit: "ng/mL",
    type: "number",
    refMin: 30,
    refMax: 250,
    refLabel: "30 – 250 ng/mL",
    plausibleMin: 1,
    plausibleMax: 5000,
    clinicalDirection: "higher_better",
    decimals: 0,
  },
  {
    key: "ferro_serico",
    label: "Ferro Sérico",
    shortLabel: "Ferro",
    category: "hemograma_ferro",
    priority: 84,
    aliases: ["ferr", "ferro", "fe", "ferro serico"],
    unit: "µg/dL",
    type: "number",
    refMin: 50,
    refMax: 170,
    refLabel: "50 – 170 µg/dL",
    plausibleMin: 5,
    plausibleMax: 600,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "transferrina",
    label: "Transferrina",
    category: "hemograma_ferro",
    priority: 68,
    aliases: ["transf", "transferrina"],
    unit: "mg/dL",
    type: "number",
    refMin: 200,
    refMax: 360,
    refLabel: "200 – 360 mg/dL",
    plausibleMin: 50,
    plausibleMax: 700,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "ctlf",
    label: "CTLF (Capacidade Total de Ligação do Ferro)",
    shortLabel: "CTLF",
    category: "hemograma_ferro",
    priority: 65,
    aliases: ["ctlf", "tibc"],
    unit: "µg/dL",
    type: "number",
    refMin: 250,
    refMax: 425,
    refLabel: "250 – 425 µg/dL",
    plausibleMin: 80,
    plausibleMax: 900,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "saturacao_transferrina",
    label: "Saturação da Transferrina (IST)",
    shortLabel: "IST",
    category: "hemograma_ferro",
    priority: 76,
    aliases: ["ist", "sat transf", "saturacao transferrina"],
    unit: "%",
    type: "number",
    refMin: 20,
    refMax: 50,
    refLabel: "20 – 50%",
    plausibleMin: 2,
    plausibleMax: 100,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },

  // --------------------------------------------------------------------------
  // GRUPO 8: Vitaminas & Minerais (Nutrologia) (12)
  // --------------------------------------------------------------------------
  {
    key: "vitamina_d",
    label: "Vitamina D (25-OH)",
    shortLabel: "Vit D",
    category: "vitaminas_minerais",
    priority: 98,
    aliases: ["vit", "vit d", "vitd", "25oh", "25-oh", "25 oh d", "vitamina d", "colecalciferol"],
    unit: "ng/mL",
    type: "number",
    refMin: 30,
    refMax: 100,
    refLabel: "30 – 100 ng/mL",
    plausibleMin: 3,
    plausibleMax: 200,
    clinicalDirection: "higher_better",
    decimals: 0,
  },
  {
    key: "vitamina_b12",
    label: "Vitamina B12",
    shortLabel: "Vit B12",
    category: "vitaminas_minerais",
    priority: 95,
    aliases: ["vit", "b12", "vit b12", "vitb12", "vitamina b12", "cobalamina"],
    unit: "pg/mL",
    type: "number",
    refMin: 300,
    refMax: 900,
    refLabel: "300 – 900 pg/mL",
    plausibleMin: 40,
    plausibleMax: 4000,
    clinicalDirection: "higher_better",
    decimals: 0,
  },
  {
    key: "acido_folico",
    label: "Ácido Fólico (Folato)",
    shortLabel: "Folato",
    category: "vitaminas_minerais",
    priority: 86,
    aliases: ["folato", "acido folico", "b9", "vit b9", "folico"],
    unit: "ng/mL",
    type: "number",
    refMin: 5.0,
    refMax: 24.0,
    refLabel: "> 5,0 ng/mL",
    plausibleMin: 0.5,
    plausibleMax: 100,
    clinicalDirection: "higher_better",
    decimals: 1,
  },
  {
    key: "acido_metilmalonico",
    label: "Ácido Metilmalônico",
    category: "vitaminas_minerais",
    priority: 60,
    aliases: ["amm", "mma", "metilmalonico"],
    unit: "µmol/L",
    type: "number",
    refMin: 0,
    refMax: 0.4,
    refLabel: "< 0,40 µmol/L",
    plausibleMin: 0.01,
    plausibleMax: 20,
    clinicalDirection: "lower_better",
    decimals: 2,
  },
  {
    key: "vitamina_b1",
    label: "Vitamina B1 (Tiamina)",
    shortLabel: "Vit B1",
    category: "vitaminas_minerais",
    priority: 62,
    aliases: ["vit", "b1", "vit b1", "tiamina"],
    unit: "nmol/L",
    type: "number",
    refMin: 70,
    refMax: 180,
    refLabel: "70 – 180 nmol/L",
    plausibleMin: 10,
    plausibleMax: 600,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "vitamina_b6",
    label: "Vitamina B6 (Piridoxina)",
    shortLabel: "Vit B6",
    category: "vitaminas_minerais",
    priority: 64,
    aliases: ["vit", "b6", "vit b6", "piridoxina"],
    unit: "µg/L",
    type: "number",
    refMin: 5,
    refMax: 50,
    refLabel: "5 – 50 µg/L",
    plausibleMin: 1,
    plausibleMax: 400,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "vitamina_a",
    label: "Vitamina A (Retinol)",
    shortLabel: "Vit A",
    category: "vitaminas_minerais",
    priority: 60,
    aliases: ["vit", "vit a", "retinol"],
    unit: "mg/L",
    type: "number",
    refMin: 0.3,
    refMax: 0.7,
    refLabel: "0,30 – 0,70 mg/L",
    plausibleMin: 0.05,
    plausibleMax: 5.0,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "vitamina_c",
    label: "Vitamina C (Ácido Ascórbico)",
    shortLabel: "Vit C",
    category: "vitaminas_minerais",
    priority: 60,
    aliases: ["vit", "vit c", "ascorbico"],
    unit: "mg/dL",
    type: "number",
    refMin: 0.4,
    refMax: 2.0,
    refLabel: "0,4 – 2,0 mg/dL",
    plausibleMin: 0.05,
    plausibleMax: 10.0,
    clinicalDirection: "higher_better",
    decimals: 2,
  },
  {
    key: "vitamina_e",
    label: "Vitamina E (Tocoferol)",
    shortLabel: "Vit E",
    category: "vitaminas_minerais",
    priority: 58,
    aliases: ["vit", "vit e", "tocoferol"],
    unit: "mg/L",
    type: "number",
    refMin: 5.0,
    refMax: 20.0,
    refLabel: "5,0 – 20,0 mg/L",
    plausibleMin: 0.5,
    plausibleMax: 80,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "zinco",
    label: "Zinco Sérico",
    shortLabel: "Zinco",
    category: "vitaminas_minerais",
    priority: 78,
    aliases: ["zn", "zinco"],
    unit: "µg/dL",
    type: "number",
    refMin: 70,
    refMax: 120,
    refLabel: "70 – 120 µg/dL",
    plausibleMin: 15,
    plausibleMax: 350,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "selenio",
    label: "Selênio",
    shortLabel: "Selênio",
    category: "vitaminas_minerais",
    priority: 72,
    aliases: ["se", "selenio"],
    unit: "µg/L",
    type: "number",
    refMin: 70,
    refMax: 150,
    refLabel: "70 – 150 µg/L",
    plausibleMin: 10,
    plausibleMax: 500,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "cobre",
    label: "Cobre Sérico",
    shortLabel: "Cobre",
    category: "vitaminas_minerais",
    priority: 65,
    aliases: ["cu", "cobre"],
    unit: "µg/dL",
    type: "number",
    refMin: 70,
    refMax: 140,
    refLabel: "70 – 140 µg/dL",
    plausibleMin: 15,
    plausibleMax: 400,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },

  // --------------------------------------------------------------------------
  // GRUPO 9: Fígado, Vias Biliares & Pâncreas (11)
  // --------------------------------------------------------------------------
  {
    key: "tgo",
    label: "TGO (AST)",
    shortLabel: "TGO",
    category: "figado_pancreas",
    priority: 92,
    aliases: ["tgo", "ast", "tgo/ast", "aspartato"],
    unit: "U/L",
    type: "number",
    refMin: 0,
    refMax: 32,
    refLabel: "< 32 U/L",
    plausibleMin: 2,
    plausibleMax: 5000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "tgp",
    label: "TGP (ALT)",
    shortLabel: "TGP",
    category: "figado_pancreas",
    priority: 93,
    aliases: ["tgp", "alt", "tgp/alt", "alanina"],
    unit: "U/L",
    type: "number",
    refMin: 0,
    refMax: 33,
    refLabel: "< 33 U/L",
    plausibleMin: 2,
    plausibleMax: 5000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "ggt",
    label: "GGT (Gama-GT)",
    shortLabel: "GGT",
    category: "figado_pancreas",
    priority: 88,
    aliases: ["ggt", "gama gt", "gamagt", "gama-gt"],
    unit: "U/L",
    type: "number",
    refMin: 0,
    refMax: 40,
    refLabel: "< 40 U/L",
    plausibleMin: 2,
    plausibleMax: 3000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "fosfatase_alcalina",
    label: "Fosfatase Alcalina",
    shortLabel: "FA",
    category: "figado_pancreas",
    priority: 80,
    aliases: ["fa", "fal", "fosfatase alcalina", "fosf alcalina"],
    unit: "U/L",
    type: "number",
    refMin: 35,
    refMax: 105,
    refLabel: "35 – 105 U/L",
    plausibleMin: 5,
    plausibleMax: 2500,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "bilirrubina_total",
    label: "Bilirrubina Total",
    shortLabel: "BT",
    category: "figado_pancreas",
    priority: 78,
    aliases: ["bt", "bili", "bili total", "bilirrubina"],
    unit: "mg/dL",
    type: "number",
    refMin: 0,
    refMax: 1.2,
    refLabel: "< 1,2 mg/dL",
    plausibleMin: 0.05,
    plausibleMax: 40,
    clinicalDirection: "lower_better",
    decimals: 2,
  },
  {
    key: "bilirrubina_direta",
    label: "Bilirrubina Direta",
    shortLabel: "BD",
    category: "figado_pancreas",
    priority: 70,
    aliases: ["bd", "bili direta", "bilirrubina direta"],
    unit: "mg/dL",
    type: "number",
    refMin: 0,
    refMax: 0.3,
    refLabel: "< 0,3 mg/dL",
    plausibleMin: 0.01,
    plausibleMax: 30,
    clinicalDirection: "lower_better",
    decimals: 2,
  },
  {
    key: "bilirrubina_indireta",
    label: "Bilirrubina Indireta",
    shortLabel: "BI",
    category: "figado_pancreas",
    priority: 68,
    aliases: ["bi", "bili indireta", "bilirrubina indireta"],
    unit: "mg/dL",
    type: "number",
    refMin: 0,
    refMax: 0.9,
    refLabel: "< 0,9 mg/dL",
    plausibleMin: 0.01,
    plausibleMax: 30,
    clinicalDirection: "lower_better",
    decimals: 2,
  },
  {
    key: "proteinas_totais",
    label: "Proteínas Totais",
    category: "figado_pancreas",
    priority: 72,
    aliases: ["pt", "proteinas", "proteina total"],
    unit: "g/dL",
    type: "number",
    refMin: 6.4,
    refMax: 8.3,
    refLabel: "6,4 – 8,3 g/dL",
    plausibleMin: 2.0,
    plausibleMax: 14.0,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "albumina",
    label: "Albumina",
    shortLabel: "Alb",
    category: "figado_pancreas",
    priority: 82,
    aliases: ["alb", "albumina"],
    unit: "g/dL",
    type: "number",
    refMin: 3.5,
    refMax: 5.2,
    refLabel: "3,5 – 5,2 g/dL",
    plausibleMin: 1.0,
    plausibleMax: 8.0,
    clinicalDirection: "higher_better",
    decimals: 1,
  },
  {
    key: "amilase",
    label: "Amilase",
    category: "figado_pancreas",
    priority: 70,
    aliases: ["amil", "amilase"],
    unit: "U/L",
    type: "number",
    refMin: 28,
    refMax: 100,
    refLabel: "28 – 100 U/L",
    plausibleMin: 5,
    plausibleMax: 5000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "lipase",
    label: "Lipase",
    category: "figado_pancreas",
    priority: 72,
    aliases: ["lip", "lipase"],
    unit: "U/L",
    type: "number",
    refMin: 13,
    refMax: 60,
    refLabel: "13 – 60 U/L",
    plausibleMin: 2,
    plausibleMax: 5000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },

  // --------------------------------------------------------------------------
  // GRUPO 10: Rins, Eletrólitos & Urina (11)
  // --------------------------------------------------------------------------
  {
    key: "creatinina",
    label: "Creatinina",
    shortLabel: "Cr",
    category: "rins_eletrolitos",
    priority: 95,
    aliases: ["cr", "creat", "creatinina"],
    unit: "mg/dL",
    type: "number",
    refMin: 0.6,
    refMax: 1.2,
    refLabel: "0,60 – 1,20 mg/dL",
    plausibleMin: 0.15,
    plausibleMax: 25.0,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "tfg_ckdepi",
    label: "TFG Estimada (CKD-EPI)",
    shortLabel: "TFG",
    category: "rins_eletrolitos",
    priority: 88,
    aliases: ["tfg", "ckdepi", "ckd-epi", "rfg", "filtracao glomerular"],
    unit: "mL/min",
    type: "number",
    refMin: 60,
    refMax: 140,
    refLabel: "> 60 mL/min",
    plausibleMin: 3,
    plausibleMax: 200,
    clinicalDirection: "higher_better",
    decimals: 0,
  },
  {
    key: "ureia",
    label: "Ureia",
    shortLabel: "Ureia",
    category: "rins_eletrolitos",
    priority: 86,
    aliases: ["ur", "ureia", "bun"],
    unit: "mg/dL",
    type: "number",
    refMin: 15,
    refMax: 45,
    refLabel: "15 – 45 mg/dL",
    plausibleMin: 3,
    plausibleMax: 400,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "cistatina_c",
    label: "Cistatina C",
    category: "rins_eletrolitos",
    priority: 68,
    aliases: ["cistatina", "cistatina c"],
    unit: "mg/L",
    type: "number",
    refMin: 0.5,
    refMax: 1.0,
    refLabel: "0,50 – 1,00 mg/L",
    plausibleMin: 0.2,
    plausibleMax: 15,
    clinicalDirection: "lower_better",
    decimals: 2,
  },
  {
    key: "acido_urico",
    label: "Ácido Úrico",
    shortLabel: "Ac. Úrico",
    category: "rins_eletrolitos",
    priority: 89,
    aliases: ["au", "ac urico", "acido urico", "urato"],
    unit: "mg/dL",
    type: "number",
    refMin: 2.5,
    refMax: 6.0,
    refLabel: "2,5 – 6,0 mg/dL",
    plausibleMin: 0.5,
    plausibleMax: 20.0,
    clinicalDirection: "lower_better",
    decimals: 1,
  },
  {
    key: "sodio",
    label: "Sódio",
    shortLabel: "Na+",
    category: "rins_eletrolitos",
    priority: 85,
    aliases: ["na", "na+", "sodio"],
    unit: "mEq/L",
    type: "number",
    refMin: 135,
    refMax: 145,
    refLabel: "135 – 145 mEq/L",
    plausibleMin: 100,
    plausibleMax: 180,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "potassio",
    label: "Potássio",
    shortLabel: "K+",
    category: "rins_eletrolitos",
    priority: 85,
    aliases: ["k", "k+", "potassio"],
    unit: "mEq/L",
    type: "number",
    refMin: 3.5,
    refMax: 5.1,
    refLabel: "3,5 – 5,1 mEq/L",
    plausibleMin: 1.5,
    plausibleMax: 10.0,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "cloreto",
    label: "Cloreto",
    shortLabel: "Cl-",
    category: "rins_eletrolitos",
    priority: 65,
    aliases: ["cl", "cloro", "cloreto"],
    unit: "mEq/L",
    type: "number",
    refMin: 98,
    refMax: 107,
    refLabel: "98 – 107 mEq/L",
    plausibleMin: 60,
    plausibleMax: 145,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "bicarbonato",
    label: "Bicarbonato (HCO3)",
    shortLabel: "HCO3",
    category: "rins_eletrolitos",
    priority: 64,
    aliases: ["hco3", "bic", "bicarbonato"],
    unit: "mEq/L",
    type: "number",
    refMin: 22,
    refMax: 29,
    refLabel: "22 – 29 mEq/L",
    plausibleMin: 5,
    plausibleMax: 55,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "microalbuminuria",
    label: "Microalbuminúria (Relação A/C)",
    shortLabel: "Microalb",
    category: "rins_eletrolitos",
    priority: 78,
    aliases: ["microalb", "rac", "microalbuminuria", "albumina creatinina"],
    unit: "mg/g",
    type: "number",
    refMin: 0,
    refMax: 30,
    refLabel: "< 30 mg/g",
    plausibleMin: 0,
    plausibleMax: 10000,
    clinicalDirection: "lower_better",
    decimals: 1,
  },
  {
    key: "eas_urina",
    label: "EAS / Urina Tipo 1",
    shortLabel: "EAS",
    category: "rins_eletrolitos",
    priority: 76,
    aliases: ["eas", "urina", "urina 1", "urina tipo 1", "sumario urina"],
    unit: "",
    type: "text",
    refLabel: "Sem alterações",
    clinicalDirection: "range_optimal",
  },

  // --------------------------------------------------------------------------
  // GRUPO 11: Inflamação, Imunidade, Intestino & Coagulação (11)
  // --------------------------------------------------------------------------
  {
    key: "pcr_us",
    label: "PCR Ultrassensível",
    shortLabel: "PCR-us",
    category: "inflamacao_imunidade",
    priority: 90,
    aliases: ["pcr", "pcr us", "pcr-us", "proteina c reativa", "hscrp"],
    unit: "mg/L",
    type: "number",
    refMin: 0,
    refMax: 3.0,
    refLabel: "< 3,0 mg/L (ideal < 1,0)",
    plausibleMin: 0,
    plausibleMax: 500,
    clinicalDirection: "lower_better",
    decimals: 2,
  },
  {
    key: "vhs",
    label: "VHS",
    shortLabel: "VHS",
    category: "inflamacao_imunidade",
    priority: 78,
    aliases: ["vhs", "hemossedimentacao"],
    unit: "mm/h",
    type: "number",
    refMin: 0,
    refMax: 20,
    refLabel: "< 20 mm/h",
    plausibleMin: 0,
    plausibleMax: 180,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "fan",
    label: "FAN (Fator Antinuclear)",
    shortLabel: "FAN",
    category: "inflamacao_imunidade",
    priority: 68,
    aliases: ["fan", "ana", "fator antinuclear"],
    unit: "",
    type: "text",
    refLabel: "Não reagente",
    clinicalDirection: "range_optimal",
  },
  {
    key: "anti_transglutaminase_iga",
    label: "Anti-Transglutaminase IgA",
    category: "inflamacao_imunidade",
    priority: 64,
    aliases: ["ttg", "anti-ttg", "transglutaminase", "celiaca"],
    unit: "U/mL",
    type: "number",
    refMin: 0,
    refMax: 7,
    refLabel: "< 7,0 U/mL",
    plausibleMin: 0,
    plausibleMax: 2000,
    clinicalDirection: "lower_better",
    decimals: 1,
  },
  {
    key: "iga_total",
    label: "IgA Total",
    shortLabel: "IgA",
    category: "inflamacao_imunidade",
    priority: 62,
    aliases: ["iga", "iga total"],
    unit: "mg/dL",
    type: "number",
    refMin: 70,
    refMax: 400,
    refLabel: "70 – 400 mg/dL",
    plausibleMin: 1,
    plausibleMax: 2000,
    clinicalDirection: "range_optimal",
    decimals: 0,
  },
  {
    key: "calprotectina_fecal",
    label: "Calprotectina Fecal",
    shortLabel: "Calpro",
    category: "inflamacao_imunidade",
    priority: 72,
    aliases: ["calpro", "calprotectina", "calprotectina fecal"],
    unit: "µg/g",
    type: "number",
    refMin: 0,
    refMax: 50,
    refLabel: "< 50 µg/g",
    plausibleMin: 0,
    plausibleMax: 10000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "sangue_oculto",
    label: "Pesquisa de Sangue Oculto nas Fezes",
    shortLabel: "PSO",
    category: "inflamacao_imunidade",
    priority: 65,
    aliases: ["pso", "sangue oculto", "fezes"],
    unit: "",
    type: "text",
    refLabel: "Negativo",
    clinicalDirection: "range_optimal",
  },
  {
    key: "inr",
    label: "INR (TAP / RNI)",
    shortLabel: "INR",
    category: "inflamacao_imunidade",
    priority: 76,
    aliases: ["inr", "rni", "tap", "tp"],
    unit: "ratio",
    type: "number",
    refMin: 0.8,
    refMax: 1.2,
    refLabel: "0,80 – 1,20",
    plausibleMin: 0.4,
    plausibleMax: 15.0,
    clinicalDirection: "range_optimal",
    decimals: 2,
  },
  {
    key: "ttpa",
    label: "TTPa",
    shortLabel: "TTPa",
    category: "inflamacao_imunidade",
    priority: 66,
    aliases: ["ttpa", "kptt"],
    unit: "seg",
    type: "number",
    refMin: 25,
    refMax: 36,
    refLabel: "25 – 36 seg",
    plausibleMin: 10,
    plausibleMax: 200,
    clinicalDirection: "range_optimal",
    decimals: 1,
  },
  {
    key: "d_dimero",
    label: "D-Dímero",
    shortLabel: "D-Dímero",
    category: "inflamacao_imunidade",
    priority: 70,
    aliases: ["ddimero", "d-dimero", "dimero d"],
    unit: "ng/mL",
    type: "number",
    refMin: 0,
    refMax: 500,
    refLabel: "< 500 ng/mL",
    plausibleMin: 0,
    plausibleMax: 50000,
    clinicalDirection: "lower_better",
    decimals: 0,
  },
  {
    key: "sorologias_checkup",
    label: "Sorologias Check-up (HIV / Hep B e C / Sífilis)",
    shortLabel: "Sorologias",
    category: "inflamacao_imunidade",
    priority: 64,
    aliases: ["sorologias", "hiv", "vdrl", "hbsag", "anti hcv", "sifilis"],
    unit: "",
    type: "text",
    refLabel: "Não reagentes",
    clinicalDirection: "range_optimal",
  },
];

// ============================================================================
// 3. OS 4 CÁLCULOS AUTOMÁTICOS
// ============================================================================

export const CALCULATED_EXAMS: ExamDef[] = [
  {
    key: "_calc_homa_ir",
    label: "HOMA-IR (Calculado)",
    shortLabel: "HOMA-IR",
    category: "glicemico",
    priority: 90,
    aliases: ["homa", "homa ir", "homair"],
    unit: "índice",
    type: "number",
    refMin: 0,
    refMax: 2.5,
    refLabel: "< 2,50",
    clinicalDirection: "lower_better",
    decimals: 2,
    isCalculated: true,
  },
  {
    key: "_calc_homa_beta",
    label: "HOMA-Beta (Calculado)",
    shortLabel: "HOMA-β",
    category: "glicemico",
    priority: 85,
    aliases: ["homa beta", "homabeta"],
    unit: "%",
    type: "number",
    refMin: 100,
    refMax: 200,
    refLabel: "100 – 200%",
    clinicalDirection: "range_optimal",
    decimals: 1,
    isCalculated: true,
  },
  {
    key: "_calc_nao_hdl",
    label: "Colesterol Não-HDL (Calculado)",
    shortLabel: "Não-HDL",
    category: "lipidico",
    priority: 91,
    aliases: ["nao hdl", "non hdl", "colesterol nao hdl"],
    unit: "mg/dL",
    type: "number",
    refMin: 0,
    refMax: 130,
    refLabel: "< 130 mg/dL",
    clinicalDirection: "lower_better",
    decimals: 0,
    isCalculated: true,
  },
  {
    key: "_calc_tg_hdl",
    label: "Relação TG / HDL (Calculado)",
    shortLabel: "TG/HDL",
    category: "lipidico",
    priority: 89,
    aliases: ["tg/hdl", "relacao tg hdl"],
    unit: "razão",
    type: "number",
    refMin: 0,
    refMax: 2.0,
    refLabel: "< 2,00",
    clinicalDirection: "lower_better",
    decimals: 2,
    isCalculated: true,
  },
];

// ============================================================================
// 4. GRUPO 12: IMAGEM & LAUDOS COMPLEMENTARES
// ============================================================================

export const LAUDOS_IMAGEM_CATALOG: LaudoImagemDef[] = [
  {
    key: "us_tireoide",
    label: "US de Tireoide",
    placeholder: "Ex.: Tireoide de dimensões normais, ecotextura homogênea, sem nódulos...",
  },
  {
    key: "us_abdome",
    label: "US de Abdome Total",
    placeholder: "Ex.: Esteatose hepática grau I, vias biliares sem dilatação, rins preservados...",
  },
  {
    key: "densitometria_dexa",
    label: "Densitometria Óssea / DEXA",
    placeholder: "Ex.: T-score lombar -0,6, colo femoral -0,4 (densidade mineral normal)...",
  },
  {
    key: "elastografia_hepatica",
    label: "Elastografia Hepática (FibroScan)",
    placeholder: "Ex.: Rigidez hepática 4,8 kPa (F0-F1), CAP 245 dB/m...",
  },
  {
    key: "cardiologia_ecg_eco",
    label: "Cardiologia (ECG / Eco / Ergométrico)",
    placeholder: "Ex.: Ritmo sinusal, FE 65%, teste ergométrico negativo para isquemia...",
  },
  {
    key: "polissonografia",
    label: "Polissonografia",
    placeholder: "Ex.: IAH 4,2 eventos/h, saturação mínima 92%, eficiência do sono 88%...",
  },
  {
    key: "outros_laudos",
    label: "Outros Laudos Complementares",
    placeholder: "Ex.: RM, TC, endoscopia, colonoscopia, retinografia...",
  },
];

// ============================================================================
// 5. ATALHOS DE ROTINAS PRONTAS
// ============================================================================

export const EXAM_ROUTINES: ExamRoutineDef[] = [
  {
    id: "metabolica",
    label: "Rotina Metabólica",
    description: "10 exames essenciais (Glicemia, HbA1c, Insulina, Lipídios, Fígado, Rim)",
    keys: [
      "glicemia_jejum",
      "hba1c",
      "insulina_basal",
      "colesterol_total",
      "ldl",
      "hdl",
      "triglicerideos",
      "tgo",
      "tgp",
      "creatinina",
    ],
  },
  {
    id: "tireoide",
    label: "Rotina Tireoide",
    description: "5 exames (TSH, T4L, T3L, Anti-TPO, Anti-Tg)",
    keys: ["tsh", "t4_livre", "t3_livre", "anti_tpo", "anti_tg"],
  },
  {
    id: "vitaminas_ferro",
    label: "Vitaminas & Ferro",
    description: "6 exames (Vit D, B12, Ácido Fólico, Ferritina, Ferro Sérico, Hb)",
    keys: [
      "vitamina_d",
      "vitamina_b12",
      "acido_folico",
      "ferritina",
      "ferro_serico",
      "hemoglobina",
    ],
  },
  {
    id: "hormonal",
    label: "Hormonal",
    description: "8 exames (Testo Total/Livre, SHBG, E2, Progesterona, LH, FSH, Prolactina)",
    keys: [
      "testosterona_total",
      "testosterona_livre",
      "shbg",
      "estradiol",
      "progesterona",
      "lh",
      "fsh",
      "prolactina",
    ],
  },
];

// ============================================================================
// 6. MAPAS E UTILITÁRIOS DE BUSCA / PARSING
// ============================================================================

export const EXAM_BY_KEY: Record<string, ExamDef> = [...EXAM_CATALOG, ...CALCULATED_EXAMS].reduce(
  (acc, item) => {
    acc[item.key] = item;
    return acc;
  },
  {} as Record<string, ExamDef>,
);

export const LAUDO_BY_KEY: Record<string, LaudoImagemDef> = LAUDOS_IMAGEM_CATALOG.reduce(
  (acc, item) => {
    acc[item.key] = item;
    return acc;
  },
  {} as Record<string, LaudoImagemDef>,
);

export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNumericExamValue(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/\s+/g, "");
  if (!cleaned) return null;
  // Suporta "5,7" ou "5.7" ou "1.250,5"
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function formatExamNumber(value: number, decimals?: number): string {
  if (!Number.isFinite(value)) return "--";
  if (typeof decimals === "number") {
    if (decimals === 0) {
      return Number.isInteger(value)
        ? String(value)
        : value.toFixed(1).replace(".", ",");
    }
    return value.toFixed(decimals).replace(".", ",");
  }
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString().replace(".", ",");
}

/**
 * Detecta se o usuário digitou "termo + valor numérico" direto no Campo 1
 * (ex.: "glic 5,8" ou "tsh 2.1"), separando de forma segura para nunca gravar
 * silenciosamente quando houver ambiguidade entre exames.
 */
export function extractTermAndTrailingValue(rawInput: string): {
  term: string;
  trailingValue: string | null;
} {
  const trimmed = rawInput.trim();
  // Evita confundir nomes que contêm números intrínsecos como "t4", "t3", "b12", "b1", "b6", "e2", "p4", "17oh", "totg 60", "totg 120", "igf 1", "apo a1"
  const match = trimmed.match(/^([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ0-9\s./-]*?)\s+(\d+(?:[.,]\d+)?)$/);
  if (!match) {
    return { term: trimmed, trailingValue: null };
  }
  const candidateTerm = match[1].trim();
  const candidateNum = match[2].trim();
  const normFull = normalizeSearchText(trimmed);

  // Se o texto completo já bate com um alias/label conhecido (ex.: "totg 60", "totg 120", "vitamina b12", "vit b12", "igf 1", "apo a1", "urina 1"), NÃO separar como valor!
  const matchesKnownExamWithNumber = EXAM_CATALOG.some((ex) => {
    const labelNorm = normalizeSearchText(ex.label);
    if (labelNorm.includes(normFull)) return true;
    return ex.aliases.some((a) => normalizeSearchText(a) === normFull || normalizeSearchText(a).startsWith(normFull));
  });

  if (matchesKnownExamWithNumber) {
    return { term: trimmed, trailingValue: null };
  }

  return { term: candidateTerm, trailingValue: candidateNum };
}

/**
 * Busca inteligente nos 125 exames laboratoriais, ordenada por:
 * 1) Match exato de alias/key/label
 * 2) Prioridade clínica (priority DESC) para desambiguar prefixos iguais
 *    (ex.: `gli` -> #1 Glicemia de Jejum, #2 HbA1c, #3 Glicemia Pós-Prandial;
 *     `t4` -> #1 T4 Livre, #2 T4 Total; `t3` -> #1 T3 Livre, #2 T3 Total, #3 T3 Reverso;
 *     `testo` -> #1 Testosterona Total, #2 Testosterona Livre;
 *     `vit` -> #1 Vitamina D, #2 Vitamina B12; `ferr` -> #1 Ferritina, #2 Ferro Sérico)
 */
export function searchExamCatalog(query: string, limit = 6): ExamDef[] {
  const norm = normalizeSearchText(query);
  if (!norm) {
    return [...EXAM_CATALOG]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);
  }

  const tokens = norm.split(" ").filter(Boolean);

  const scored: Array<{ exam: ExamDef; score: number }> = [];

  for (const exam of EXAM_CATALOG) {
    const labelNorm = normalizeSearchText(exam.label);
    const keyNorm = exam.key.replace(/_/g, " ");
    const aliasesNorm = exam.aliases.map(normalizeSearchText);

    let matchTier = 0;

    // Tier 4: Exact match on alias, key, or label
    if (
      aliasesNorm.includes(norm) ||
      keyNorm === norm ||
      labelNorm === norm
    ) {
      matchTier = 400;
    }
    // Tier 3: Prefix match on alias, label, or word in label
    else if (
      aliasesNorm.some((a) => a.startsWith(norm)) ||
      labelNorm.startsWith(norm) ||
      keyNorm.startsWith(norm)
    ) {
      matchTier = 300;
    }
    // Tier 2: Any word in label or alias starts with query (or all tokens match)
    else if (
      labelNorm.split(" ").some((w) => w.startsWith(norm)) ||
      aliasesNorm.some((a) => a.split(" ").some((w) => w.startsWith(norm)))
    ) {
      matchTier = 240;
    }
    // Tier 1: Substring or multi-token match
    else if (
      tokens.every(
        (tok) =>
          labelNorm.includes(tok) ||
          keyNorm.includes(tok) ||
          aliasesNorm.some((a) => a.includes(tok)),
      )
    ) {
      matchTier = 150;
    }

    if (matchTier > 0) {
      // Priority dominates within the same prefix/alias band so clinical order is strictly preserved
      // Notice: for prefixes like "gli", "t4", "t3", "testo", "vit", "ferr", the aliases include the prefix
      // so all sibling exams get the same exact/prefix band and rank strictly by `exam.priority`!
      const score = matchTier * 10 + exam.priority * 10;
      scored.push({ exam, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.exam.priority - a.exam.priority;
  });

  return scored.slice(0, limit).map((s) => s.exam);
}

// ============================================================================
// 7. TRAVA DE PLAUSIBILIDADE CLÍNICA
// ============================================================================

export interface PlausibilityCheck {
  plausible: boolean;
  message?: string;
}

export function checkExamPlausibility(
  exam: ExamDef,
  rawValue: string | number,
): PlausibilityCheck {
  if (exam.type !== "number") return { plausible: true };
  const num = parseNumericExamValue(rawValue);
  if (num === null) {
    return {
      plausible: false,
      message: `Valor numérico inválido para ${exam.label}.`,
    };
  }
  if (
    exam.plausibleMin !== undefined &&
    num < exam.plausibleMin
  ) {
    return {
      plausible: false,
      message: `Valor muito baixo para ${exam.label} (${formatExamNumber(num)} ${exam.unit}). Faixa fisiológica esperada: ${formatExamNumber(exam.plausibleMin)} a ${formatExamNumber(exam.plausibleMax ?? 0)} ${exam.unit}. Verifique se o exame selecionado está correto ou pressione Enter novamente para confirmar.`,
    };
  }
  if (
    exam.plausibleMax !== undefined &&
    num > exam.plausibleMax
  ) {
    return {
      plausible: false,
      message: `Valor muito alto para ${exam.label} (${formatExamNumber(num)} ${exam.unit}). Faixa fisiológica esperada: ${formatExamNumber(exam.plausibleMin ?? 0)} a ${formatExamNumber(exam.plausibleMax)} ${exam.unit}. Verifique se o exame selecionado está correto ou pressione Enter novamente para confirmar.`,
    };
  }
  return { plausible: true };
}

// ============================================================================
// 8. CÁLCULOS AUTOMÁTICOS EM TEMPO REAL
// ============================================================================

export function computeCalculatedExams(
  valores: Record<string, number | string>,
): Record<string, number> {
  const result: Record<string, number> = {};

  const glic = parseNumericExamValue(valores.glicemia_jejum);
  const ins = parseNumericExamValue(valores.insulina_basal);
  const ct = parseNumericExamValue(valores.colesterol_total);
  const hdl = parseNumericExamValue(valores.hdl);
  const tg = parseNumericExamValue(valores.triglicerideos);

  // 1. HOMA-IR = (glicemia_jejum * insulina_basal) / 405
  if (glic !== null && ins !== null && glic > 0 && ins > 0) {
    result._calc_homa_ir = Number(((glic * ins) / 405).toFixed(2));
  }

  // 2. HOMA-Beta = (20 * insulina_basal) / ((glicemia_jejum / 18) - 3.5) quando glicemia_jejum > 63
  if (glic !== null && ins !== null && glic > 63 && ins > 0) {
    const denom = glic / 18 - 3.5;
    if (denom > 0.01) {
      result._calc_homa_beta = Number(((20 * ins) / denom).toFixed(1));
    }
  }

  // 3. Colesterol Não-HDL = colesterol_total - hdl
  if (ct !== null && hdl !== null && ct > hdl) {
    result._calc_nao_hdl = Math.round(ct - hdl);
  }

  // 4. Relação TG/HDL = triglicerideos / hdl
  if (tg !== null && hdl !== null && tg > 0 && hdl > 0) {
    result._calc_tg_hdl = Number((tg / hdl).toFixed(2));
  }

  return result;
}

// ============================================================================
// 9. FUNÇÃO PURA DE AVALIAÇÃO CLÍNICA (MELHORA / PIORA / ESTÁVEL)
// ============================================================================

function getRangeDistance(
  val: number,
  refMin?: number,
  refMax?: number,
): number {
  if (refMin !== undefined && val < refMin) return refMin - val;
  if (refMax !== undefined && val > refMax) return val - refMax;
  return 0;
}

export function evaluateExamStatus(
  value: number,
  examDef: Pick<ExamDef, "refMin" | "refMax">,
): ExamStatus {
  if (examDef.refMax !== undefined && value > examDef.refMax) return "high";
  if (examDef.refMin !== undefined && value < examDef.refMin) return "low";
  return "ok";
}

export function evaluateExamEvolution(
  current: number,
  previous: number | null | undefined,
  examDef: Pick<ExamDef, "refMin" | "refMax" | "clinicalDirection" | "decimals">,
): ExamEvolutionResult {
  const status = evaluateExamStatus(current, examDef);

  if (previous === null || previous === undefined || !Number.isFinite(previous)) {
    return {
      status,
      trend: "none",
      delta: null,
      percentChange: null,
      deltaFormatted: null,
      arrow: null,
      badgeLabel: null,
      needsAttention: status !== "ok",
    };
  }

  const rawDelta = current - previous;
  const decimals = examDef.decimals ?? (Number.isInteger(current) && Number.isInteger(previous) ? 0 : 2);
  const delta = Number(rawDelta.toFixed(Math.max(2, decimals)));
  const percentChange =
    previous !== 0 ? (rawDelta / Math.abs(previous)) * 100 : 0;

  const absPct = Math.abs(percentChange);
  const prevStatus = evaluateExamStatus(previous, examDef);

  let arrow: "↑" | "↓" | "→" = "→";
  if (rawDelta > 1e-6) arrow = "↑";
  else if (rawDelta < -1e-6) arrow = "↓";

  const sign = rawDelta > 1e-6 ? "+" : rawDelta < -1e-6 ? "-" : "";
  const deltaFormatted =
    Math.abs(rawDelta) < 1e-6
      ? "0"
      : `${sign}${formatExamNumber(Math.abs(rawDelta), decimals)}`;

  let trend: ExamTrend = "stable";

  if (Math.abs(rawDelta) < 1e-6) {
    trend = "stable";
  } else if (status === "ok" && prevStatus === "ok" && absPct <= 2) {
    // Oscilações ±2% já dentro da faixa ideal = estável
    trend = "stable";
  } else {
    switch (examDef.clinicalDirection) {
      case "lower_better": {
        if (examDef.refMin !== undefined && current < examDef.refMin) {
          // Abaixo do mínimo fisiológico (ex.: hipoglicemia)
          trend = previous < examDef.refMin && rawDelta > 0 ? "improved" : "worsened";
        } else if (rawDelta < 0) {
          trend = "improved";
        } else {
          // Subiu
          trend = status === "high" || absPct > 2 ? "worsened" : "stable";
        }
        break;
      }

      case "higher_better": {
        if (examDef.refMax !== undefined && current > examDef.refMax) {
          // Acima do limite superior de segurança (ex.: toxicidade de vitamina D)
          trend = previous > examDef.refMax && rawDelta < 0 ? "improved" : "worsened";
        } else if (rawDelta > 0) {
          trend = "improved";
        } else {
          // Caiu
          trend = status === "low" || absPct > 2 ? "worsened" : "stable";
        }
        break;
      }

      case "range_optimal": {
        const currDist = getRangeDistance(current, examDef.refMin, examDef.refMax);
        const prevDist = getRangeDistance(previous, examDef.refMin, examDef.refMax);

        if (currDist < prevDist - 1e-6) {
          trend = "improved";
        } else if (currDist > prevDist + 1e-6) {
          trend = "worsened";
        } else if (currDist === 0 && prevDist === 0) {
          // Ambos dentro da faixa ideal: verifica se aproximou significativamente do ponto médio
          if (examDef.refMin !== undefined && examDef.refMax !== undefined) {
            const mid = (examDef.refMin + examDef.refMax) / 2;
            const currMidDist = Math.abs(current - mid);
            const prevMidDist = Math.abs(previous - mid);
            if (currMidDist < prevMidDist - 1e-6 && absPct > 2) {
              trend = "improved";
            } else {
              trend = "stable";
            }
          } else {
            trend = "stable";
          }
        } else {
          trend = "stable";
        }
        break;
      }
    }
  }

  const badgeLabel =
    trend === "improved"
      ? "Melhorou"
      : trend === "worsened"
        ? "Atenção"
        : "Estável";

  // Em atenção se piorou OU continua fora da meta sem melhora
  const needsAttention =
    trend === "worsened" || (status !== "ok" && trend !== "improved");

  return {
    status,
    trend,
    delta,
    percentChange: Number(percentChange.toFixed(1)),
    deltaFormatted,
    arrow,
    badgeLabel,
    needsAttention,
  };
}

// ============================================================================
// 10. RESUMO PARA EVOLUÇÃO CLÍNICA
// ============================================================================

const SUMMARY_PRIORITY_KEYS = [
  "glicemia_jejum",
  "hba1c",
  "_calc_homa_ir",
  "insulina_basal",
  "colesterol_total",
  "ldl",
  "hdl",
  "triglicerideos",
  "tsh",
  "t4_livre",
  "vitamina_d",
  "vitamina_b12",
  "ferritina",
  "tgo",
  "tgp",
  "ggt",
  "creatinina",
  "acido_urico",
  "pcr_us",
];

export function buildExameResumoParaEvolucao(
  lote: ExameLaboratorialDTO,
  dataFormatadaBR: string,
): string {
  const calc = computeCalculatedExams(lote.valores || {});
  const merged: Record<string, number | string> = {
    ...(lote.valores || {}),
    ...calc,
  };

  const parts: string[] = [];
  const used = new Set<string>();

  const formatEntry = (key: string, val: number | string) => {
    const def = EXAM_BY_KEY[key];
    if (!def) return;
    const label = def.shortLabel || def.label;
    if (def.type === "number") {
      const num = parseNumericExamValue(val);
      if (num === null) return;
      const suffix = def.unit === "%" ? "%" : "";
      parts.push(`${label} ${formatExamNumber(num, def.decimals)}${suffix}`);
    } else if (typeof val === "string" && val.trim()) {
      parts.push(`${label}: ${val.trim()}`);
    }
    used.add(key);
  };

  for (const key of SUMMARY_PRIORITY_KEYS) {
    if (merged[key] !== undefined && merged[key] !== null && merged[key] !== "") {
      formatEntry(key, merged[key]);
    }
  }

  for (const [key, val] of Object.entries(merged)) {
    if (used.has(key) || val === undefined || val === null || val === "") continue;
    formatEntry(key, val);
  }

  for (const custom of lote.examesPersonalizados || []) {
    if (custom?.nome && custom?.valor !== undefined && custom?.valor !== "") {
      parts.push(
        `${custom.nome} ${custom.valor}${custom.unidade ? ` ${custom.unidade}` : ""}`,
      );
    }
  }

  const labSuffix = lote.laboratorio ? ` [${lote.laboratorio}]` : "";
  return `EXAMES (${dataFormatadaBR})${labSuffix}: ${parts.join(" | ")}`;
}
