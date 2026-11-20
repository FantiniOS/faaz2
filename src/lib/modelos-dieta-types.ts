import type { UnidadeMedidaDieta } from "@/lib/db/entities/nutrition";

export type EscopoModeloDieta = "REFEICAO" | "PLANO_COMPLETO";

export type CategoriaRefeicaoModelo =
  | "DESJEJUM"
  | "COLACAO"
  | "ALMOCO"
  | "LANCHE"
  | "JANTAR"
  | "CEIA"
  | "GERAL";

export type ObjetivoTagModelo =
  | "EMAGRECIMENTO"
  | "HIPERTROFIA"
  | "CONTROLE_GLICEMICO"
  | "MANUTENCAO"
  | "GERAL";

export const CATEGORIAS_REFEICAO_OPCOES: ReadonlyArray<{
  value: CategoriaRefeicaoModelo;
  label: string;
}> = [
  { value: "DESJEJUM", label: "Desjejum / Café da Manhã" },
  { value: "COLACAO", label: "Colação / Lanche Manhã" },
  { value: "ALMOCO", label: "Almoço" },
  { value: "LANCHE", label: "Lanche da Tarde / Pré-Treino" },
  { value: "JANTAR", label: "Jantar" },
  { value: "CEIA", label: "Ceia" },
  { value: "GERAL", label: "Geral" },
];

export const OBJETIVOS_TAG_OPCOES: ReadonlyArray<{
  value: ObjetivoTagModelo;
  label: string;
  badgeClass: string;
}> = [
  {
    value: "EMAGRECIMENTO",
    label: "Emagrecimento",
    badgeClass: "cl-badge-emerald",
  },
  {
    value: "HIPERTROFIA",
    label: "Hipertrofia",
    badgeClass: "cl-badge-teal",
  },
  {
    value: "CONTROLE_GLICEMICO",
    label: "Controle Glicêmico",
    badgeClass: "cl-badge-amber",
  },
  {
    value: "MANUTENCAO",
    label: "Manutenção",
    badgeClass: "cl-badge-slate",
  },
  {
    value: "GERAL",
    label: "Geral",
    badgeClass: "cl-badge-slate",
  },
];

export interface ModeloDietaTrocaDTO {
  alimentoId?: string | null;
  nome: string;
  quantidade: number;
  unidade: UnidadeMedidaDieta;
  medidaCaseira?: string | null;
  categoria?: string | null;
  thumbnailUrl?: string | null;
  porcaoBase?: number;
  caloriasBase?: number;
  proteinas?: number;
  carboidratos?: number;
  gorduras?: number;
  fibras?: number;
}

export interface ModeloDietaItemDTO {
  alimentoId: string;
  nome: string;
  quantidade: number;
  unidade: UnidadeMedidaDieta;
  medidaCaseira?: string | null;
  categoria?: string | null;
  thumbnailUrl?: string | null;
  porcaoBase: number;
  caloriasBase: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  fibras: number;
  trocas: ModeloDietaTrocaDTO[];
}

export interface ModeloDietaRefeicaoDTO {
  nome: string;
  horario?: string | null;
  opcional?: boolean;
  observacoes?: string | null;
  itens: ModeloDietaItemDTO[];
}

export interface ModeloDietaConteudoRefeicao {
  nome?: string;
  horario?: string | null;
  opcional?: boolean;
  observacoes?: string | null;
  itens: ModeloDietaItemDTO[];
}

export interface ModeloDietaConteudoPlano {
  refeicoes: ModeloDietaRefeicaoDTO[];
}

export type ModeloDietaConteudo =
  | ModeloDietaConteudoRefeicao
  | ModeloDietaConteudoPlano;

export interface ModeloDietaDTO {
  id: string;
  organizationId: string | null;
  medicoId: string | null;
  escopo: EscopoModeloDieta;
  categoriaRefeicao: CategoriaRefeicaoModelo | null;
  titulo: string;
  objetivoTag: ObjetivoTagModelo;
  descricao: string | null;
  conteudo: ModeloDietaConteudo;
  padraoSistema: boolean;
  createdAt: string;
  updatedAt: string;
}

export function isConteudoPlanoCompleto(
  conteudo: ModeloDietaConteudo | null | undefined,
): conteudo is ModeloDietaConteudoPlano {
  return Boolean(
    conteudo &&
      "refeicoes" in conteudo &&
      Array.isArray((conteudo as ModeloDietaConteudoPlano).refeicoes),
  );
}

/**
 * Infere a categoria de refeição a partir do título exibido no card da Dieta.
 */
export function inferirCategoriaRefeicao(
  nomeRefeicao?: string | null,
): CategoriaRefeicaoModelo {
  const norm = (nomeRefeicao || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (norm.includes("desjejum") || norm.includes("cafe")) return "DESJEJUM";
  if (norm.includes("colacao") || norm.includes("manha")) return "COLACAO";
  if (norm.includes("almoco")) return "ALMOCO";
  if (norm.includes("lanche") || norm.includes("pre-treino") || norm.includes("pre treino") || norm.includes("tarde")) {
    return "LANCHE";
  }
  if (norm.includes("jantar") || norm.includes("noite")) return "JANTAR";
  if (norm.includes("ceia")) return "CEIA";
  return "GERAL";
}

export function getCategoriaRefeicaoLabel(
  cat?: CategoriaRefeicaoModelo | null,
): string {
  const found = CATEGORIAS_REFEICAO_OPCOES.find((c) => c.value === cat);
  return found ? found.label : "Geral";
}

export function getObjetivoTagMeta(tag?: ObjetivoTagModelo | null) {
  return (
    OBJETIVOS_TAG_OPCOES.find((o) => o.value === tag) ||
    OBJETIVOS_TAG_OPCOES[OBJETIVOS_TAG_OPCOES.length - 1]
  );
}

export function calcularResumoModelo(modelo: ModeloDietaDTO): {
  calorias: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  totalItens: number;
  totalTrocas: number;
  totalRefeicoes: number;
  nomesAlimentos: string[];
} {
  const refeicoes: ModeloDietaRefeicaoDTO[] = isConteudoPlanoCompleto(
    modelo.conteudo,
  )
    ? modelo.conteudo.refeicoes
    : [
        {
          nome: modelo.conteudo.nome || modelo.titulo,
          horario: modelo.conteudo.horario ?? null,
          opcional: Boolean(modelo.conteudo.opcional),
          observacoes: modelo.conteudo.observacoes ?? null,
          itens: Array.isArray(modelo.conteudo.itens)
            ? modelo.conteudo.itens
            : [],
        },
      ];

  let calorias = 0;
  let proteinas = 0;
  let carboidratos = 0;
  let gorduras = 0;
  let totalItens = 0;
  let totalTrocas = 0;
  const nomesAlimentos: string[] = [];

  for (const ref of refeicoes) {
    for (const item of ref.itens || []) {
      totalItens += 1;
      totalTrocas += Array.isArray(item.trocas) ? item.trocas.length : 0;
      if (item.nome) nomesAlimentos.push(item.nome);

      const base = item.porcaoBase > 0 ? item.porcaoBase : 100;
      const fator = Math.max(0, Number(item.quantidade) || 0) / base;
      calorias += (Number(item.caloriasBase) || 0) * fator;
      proteinas += (Number(item.proteinas) || 0) * fator;
      carboidratos += (Number(item.carboidratos) || 0) * fator;
      gorduras += (Number(item.gorduras) || 0) * fator;
    }
  }

  return {
    calorias: Math.round(calorias),
    proteinas: Number(proteinas.toFixed(1)),
    carboidratos: Number(carboidratos.toFixed(1)),
    gorduras: Number(gorduras.toFixed(1)),
    totalItens,
    totalTrocas,
    totalRefeicoes: refeicoes.length,
    nomesAlimentos,
  };
}
