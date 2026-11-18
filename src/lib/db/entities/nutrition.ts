import { EntitySchema } from "typeorm";
import {
  bool,
  clob,
  float,
  integer,
  timestampTz,
  uuidPrimary,
  uuidRef,
  varchar,
} from "./columns";
import type { Patient } from "./patient";

// ============================================================================
// 23. ALIMENTOS (Banco de Alimentos e Nutrientes Base - TACO / UNICAMP)
// ============================================================================
export interface Alimento {
  id: string;
  nome: string;
  porcaoBase: number;
  calorias: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  fibras: number | null;
  categoria: string | null;
  fonte: string | null;
  /** Caminho público do WebP 100x100 (ex.: /food-thumbnails/<sha256>.webp). NULL => fallback emoji. */
  thumbnailUrl: string | null;
  createdAt: Date;
  updatedAt: Date;

  itensRefeicao?: ItemRefeicao[];
  substituicoes?: DietSubstitution[];
}

export const AlimentoEntity = new EntitySchema<Alimento>({
  name: "Alimento",
  tableName: "ALIMENTOS",
  columns: {
    id: uuidPrimary,
    nome: varchar("NOME", 255),
    porcaoBase: { ...float("PORCAO_BASE", false), default: 100 },
    calorias: float("CALORIAS", false),
    proteinas: float("PROTEINAS", false),
    carboidratos: float("CARBOIDRATOS", false),
    gorduras: float("GORDURAS", false),
    fibras: { ...float("FIBRAS", true), default: 0 },
    categoria: { ...varchar("CATEGORIA", 100, true), default: "Geral" },
    fonte: { ...varchar("FONTE", 50, true), default: "TACO" },
    thumbnailUrl: varchar("THUMBNAILURL", 500, true),
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    itensRefeicao: {
      type: "one-to-many",
      target: "ItemRefeicao",
      inverseSide: "alimento",
    },
    substituicoes: {
      type: "one-to-many",
      target: "DietSubstitution",
      inverseSide: "substituteFood",
    },
  },
});

// ============================================================================
// 24. PLANOS_ALIMENTARES (Prescrição Dietética Vinculada ao Paciente)
// ============================================================================
export interface PlanoAlimentar {
  id: string;
  pacienteId: string;
  nome?: string;
  titulo: string;
  objetivo: string | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;

  paciente?: Patient;
  variacoes?: VariacaoDieta[];
}

export const PlanoAlimentarEntity = new EntitySchema<PlanoAlimentar>({
  name: "PlanoAlimentar",
  tableName: "PLANOS_ALIMENTARES",
  columns: {
    id: uuidPrimary,
    pacienteId: uuidRef("PACIENTE_ID"),
    titulo: { ...varchar("TITULO", 160), default: "Plano Alimentar" },
    objetivo: varchar("OBJETIVO", 255, true),
    ativo: { ...bool("ATIVO"), default: true },
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    paciente: {
      type: "many-to-one",
      target: "Patient",
      inverseSide: "planosAlimentares",
      joinColumn: { name: "PACIENTE_ID" },
      onDelete: "CASCADE",
    },
    variacoes: {
      type: "one-to-many",
      target: "VariacaoDieta",
      inverseSide: "planoAlimentar",
    },
  },
});

// ============================================================================
// 24.1 VARIACOES_DIETA (Opções de Cardápio: Opção 1, Opção 2, Treino...)
// ============================================================================
export interface VariacaoDieta {
  id: string;
  planoAlimentarId: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;

  planoAlimentar?: PlanoAlimentar;
  refeicoes?: Refeicao[];
}

export const VariacaoDietaEntity = new EntitySchema<VariacaoDieta>({
  name: "VariacaoDieta",
  tableName: "VARIACOES_DIETA",
  columns: {
    id: uuidPrimary,
    planoAlimentarId: uuidRef("PLANO_ALIMENTAR_ID"),
    nome: varchar("NOME", 100),
    descricao: varchar("DESCRICAO", 255, true),
    ordem: { ...integer("ORDEM"), default: 1 },
    ativo: { ...bool("ATIVO"), default: true },
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    planoAlimentar: {
      type: "many-to-one",
      target: "PlanoAlimentar",
      inverseSide: "variacoes",
      joinColumn: { name: "PLANO_ALIMENTAR_ID" },
      onDelete: "CASCADE",
    },
    refeicoes: {
      type: "one-to-many",
      target: "Refeicao",
      inverseSide: "variacaoDieta",
    },
  },
});

// ============================================================================
// 25. REFEICOES (Refeições vinculadas à Variação: Desjejum, Almoço...)
// ============================================================================
export interface Refeicao {
  id: string;
  variacaoDietaId: string;
  nome: string;
  horario: string | null;
  ordem: number;
  observacoes: string | null;
  createdAt: Date;
  updatedAt: Date;

  variacaoDieta?: VariacaoDieta;
  itens?: ItemRefeicao[];
}

export const RefeicaoEntity = new EntitySchema<Refeicao>({
  name: "Refeicao",
  tableName: "REFEICOES",
  columns: {
    id: uuidPrimary,
    variacaoDietaId: uuidRef("VARIACAO_DIETA_ID"),
    nome: varchar("NOME", 100),
    horario: varchar("HORARIO", 10, true),
    ordem: { ...integer("ORDEM"), default: 1 },
    observacoes: clob("OBSERVACOES"),
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    variacaoDieta: {
      type: "many-to-one",
      target: "VariacaoDieta",
      inverseSide: "refeicoes",
      joinColumn: { name: "VARIACAO_DIETA_ID" },
      onDelete: "CASCADE",
    },
    itens: {
      type: "one-to-many",
      target: "ItemRefeicao",
      inverseSide: "refeicao",
    },
  },
});

// ============================================================================
// 26. ITENS_REFEICOES (Vínculo de Refeição ao Alimento com Quantidade em Gramas)
// ============================================================================
export interface ItemRefeicao {
  id: string;
  refeicaoId: string;
  alimentoId: string;
  quantidadeGramas: number;
  observacao: string | null;
  createdAt: Date;
  updatedAt: Date;

  refeicao?: Refeicao;
  alimento?: Alimento;
  substituicoes?: DietSubstitution[];
}

export const ItemRefeicaoEntity = new EntitySchema<ItemRefeicao>({
  name: "ItemRefeicao",
  tableName: "ITENS_REFEICOES",
  columns: {
    id: uuidPrimary,
    refeicaoId: uuidRef("REFEICAO_ID"),
    alimentoId: uuidRef("ALIMENTO_ID"),
    quantidadeGramas: { ...float("QUANTIDADE_GRAMAS", false), default: 100 },
    observacao: varchar("OBSERVACAO", 160, true),
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    refeicao: {
      type: "many-to-one",
      target: "Refeicao",
      inverseSide: "itens",
      joinColumn: { name: "REFEICAO_ID" },
      onDelete: "CASCADE",
    },
    alimento: {
      type: "many-to-one",
      target: "Alimento",
      inverseSide: "itensRefeicao",
      joinColumn: { name: "ALIMENTO_ID" },
    },
    substituicoes: {
      type: "one-to-many",
      target: "DietSubstitution",
      inverseSide: "prescribedDietItem",
    },
  },
});

// ============================================================================
// 29. DIET_SUBSTITUTIONS (Substituições / Trocas de Alimentos pelo Paciente)
// ============================================================================
export interface DietSubstitution {
  id: string;
  patientId: string;
  prescribedDietItemId: string;
  substituteFoodId: string | null;
  substituteFoodName: string;
  quantityGrams: number;
  calories: number;
  proteins: number | null;
  carbohydrates: number | null;
  fats: number | null;
  /** Coluna SUBSTITUTION_DATE (DATE é palavra reservada no Oracle). */
  date: Date;
  createdAt: Date;
  updatedAt: Date;

  patient?: Patient;
  prescribedDietItem?: ItemRefeicao;
  substituteFood?: Alimento | null;
}

export const DietSubstitutionEntity = new EntitySchema<DietSubstitution>({
  name: "DietSubstitution",
  tableName: "DIET_SUBSTITUTIONS",
  columns: {
    id: uuidPrimary,
    patientId: uuidRef("PATIENT_ID"),
    prescribedDietItemId: uuidRef("PRESCRIBED_DIET_ITEM_ID"),
    substituteFoodId: uuidRef("SUBSTITUTE_FOOD_ID", true),
    substituteFoodName: varchar("SUBSTITUTE_FOOD_NAME", 160),
    quantityGrams: { ...float("QUANTITY_GRAMS", false), default: 100 },
    calories: { ...float("CALORIES", false), default: 0 },
    proteins: { ...float("PROTEINS", true), default: 0 },
    carbohydrates: { ...float("CARBOHYDRATES", true), default: 0 },
    fats: { ...float("FATS", true), default: 0 },
    date: { ...timestampTz("SUBSTITUTION_DATE"), createDate: true },
    createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
    updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  },
  relations: {
    patient: {
      type: "many-to-one",
      target: "Patient",
      inverseSide: "dietSubstitutions",
      joinColumn: { name: "PATIENT_ID" },
      onDelete: "CASCADE",
    },
    prescribedDietItem: {
      type: "many-to-one",
      target: "ItemRefeicao",
      inverseSide: "substituicoes",
      joinColumn: { name: "PRESCRIBED_DIET_ITEM_ID" },
      onDelete: "CASCADE",
    },
    substituteFood: {
      type: "many-to-one",
      target: "Alimento",
      inverseSide: "substituicoes",
      joinColumn: { name: "SUBSTITUTE_FOOD_ID" },
      nullable: true,
      onDelete: "SET NULL",
    },
  },
});
