import crypto from "crypto";
import type { Alimento, ModeloDieta } from "@/lib/db/entities";
import type {
  CategoriaRefeicaoModelo,
  EscopoModeloDieta,
  ModeloDietaConteudo,
  ModeloDietaItemDTO,
  ModeloDietaRefeicaoDTO,
  ModeloDietaTrocaDTO,
  ObjetivoTagModelo,
} from "@/lib/modelos-dieta-types";

interface FoodBlueprintSwap {
  queries: string[];
  quantidade: number;
  unidade: "g" | "ml" | "un";
  medidaCaseira: string;
}

interface FoodBlueprint {
  queries: string[];
  quantidade: number;
  unidade: "g" | "ml" | "un";
  medidaCaseira: string;
  trocas?: FoodBlueprintSwap[];
}

interface MealBlueprint {
  nome: string;
  horario: string;
  opcional?: boolean;
  observacoes?: string;
  itens: FoodBlueprint[];
}

interface TemplateSeedSpec {
  escopo: EscopoModeloDieta;
  categoriaRefeicao: CategoriaRefeicaoModelo | null;
  titulo: string;
  objetivoTag: ObjetivoTagModelo;
  descricao: string;
  refeicao?: MealBlueprint;
  refeicoes?: MealBlueprint[];
}

function normStr(val?: string | null): string {
  return (val || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createTacoResolver(alimentos: Alimento[]) {
  const indexed = alimentos
    .filter((a) => Number(a.calorias) > 0)
    .map((a) => ({
      alimento: a,
      norm: normStr(a.nome),
    }));

  const findFood = (queries: string[]): Alimento | null => {
    for (const q of queries) {
      const nq = normStr(q);
      // 1. Correspondência exata
      const exact = indexed.find((entry) => entry.norm === nq);
      if (exact) return exact.alimento;
      // 2. Correspondência por prefixo
      const prefix = indexed.find((entry) => entry.norm.startsWith(nq));
      if (prefix) return prefix.alimento;
      // 3. Correspondência por substring
      const sub = indexed.find((entry) => entry.norm.includes(nq));
      if (sub) return sub.alimento;
    }
    return indexed[0]?.alimento ?? alimentos[0] ?? null;
  };

  const resolveSwap = (bp: FoodBlueprintSwap): ModeloDietaTrocaDTO | null => {
    const food = findFood(bp.queries);
    if (!food) return null;
    return {
      alimentoId: food.id,
      nome: food.nome,
      quantidade: bp.quantidade,
      unidade: bp.unidade,
      medidaCaseira: bp.medidaCaseira,
      categoria: food.categoria ?? "Geral",
      thumbnailUrl: food.thumbnailUrl ?? null,
      porcaoBase: Number(food.porcaoBase) || 100,
      caloriasBase: Number(food.calorias) || 0,
      proteinas: Number(food.proteinas) || 0,
      carboidratos: Number(food.carboidratos) || 0,
      gorduras: Number(food.gorduras) || 0,
      fibras: Number(food.fibras) || 0,
    };
  };

  const resolveItem = (bp: FoodBlueprint): ModeloDietaItemDTO | null => {
    const food = findFood(bp.queries);
    if (!food) return null;
    const trocas = (bp.trocas || [])
      .map(resolveSwap)
      .filter((t): t is ModeloDietaTrocaDTO => t !== null);

    return {
      alimentoId: food.id,
      nome: food.nome,
      quantidade: bp.quantidade,
      unidade: bp.unidade,
      medidaCaseira: bp.medidaCaseira,
      categoria: food.categoria ?? "Geral",
      thumbnailUrl: food.thumbnailUrl ?? null,
      porcaoBase: Number(food.porcaoBase) || 100,
      caloriasBase: Number(food.calorias) || 0,
      proteinas: Number(food.proteinas) || 0,
      carboidratos: Number(food.carboidratos) || 0,
      gorduras: Number(food.gorduras) || 0,
      fibras: Number(food.fibras) || 0,
      trocas,
    };
  };

  const resolveMeal = (bp: MealBlueprint): ModeloDietaRefeicaoDTO => ({
    nome: bp.nome,
    horario: bp.horario,
    opcional: Boolean(bp.opcional),
    observacoes: bp.observacoes || null,
    itens: bp.itens
      .map(resolveItem)
      .filter((i): i is ModeloDietaItemDTO => i !== null),
  });

  return { resolveMeal };
}

// ============================================================================
// ESPECIFICAÇÃO DOS 12 MODELOS INICIAIS CLINICAMENTE REALISTAS (TACO / UNICAMP)
// ============================================================================
const DESJEJUM_EMAGRECIMENTO: MealBlueprint = {
  nome: "Desjejum / Café da Manhã",
  horario: "07:30",
  observacoes:
    "Preparar os ovos mexidos ou cozidos com fio mínimo de azeite ou frigideira antiaderente. Consumir café preto ou chá sem açúcar.",
  itens: [
    {
      queries: ["Ovo, de galinha, inteiro, cozido/10minutos", "Ovo, de galinha, inteiro"],
      quantidade: 100,
      unidade: "g",
      medidaCaseira: "2 unidades médias",
      trocas: [
        {
          queries: ["Queijo, ricota"],
          quantidade: 80,
          unidade: "g",
          medidaCaseira: "2 fatias médias",
        },
        {
          queries: ["Frango, peito, sem pele, cozido"],
          quantidade: 60,
          unidade: "g",
          medidaCaseira: "3 colheres de sopa (desfiado)",
        },
      ],
    },
    {
      queries: ["Pão, trigo, forma, integral", "Pão, aveia, forma"],
      quantidade: 50,
      unidade: "g",
      medidaCaseira: "2 fatias",
      trocas: [
        {
          queries: ["Cuscuz, de milho, cozido com sal"],
          quantidade: 100,
          unidade: "g",
          medidaCaseira: "4 colheres de sopa",
        },
        {
          queries: ["Aveia, flocos, crua"],
          quantidade: 30,
          unidade: "g",
          medidaCaseira: "2 colheres de sopa",
        },
      ],
    },
    {
      queries: ["Mamão, Papaia, cru", "Mamão, Formosa, cru"],
      quantidade: 130,
      unidade: "g",
      medidaCaseira: "1/2 unidade média",
      trocas: [
        {
          queries: ["Melão, cru"],
          quantidade: 160,
          unidade: "g",
          medidaCaseira: "1 fatia grande",
        },
        {
          queries: ["Kiwi, cru"],
          quantidade: 100,
          unidade: "g",
          medidaCaseira: "1 unidade grande",
        },
      ],
    },
  ],
};

const DESJEJUM_HIPERTROFIA: MealBlueprint = {
  nome: "Desjejum / Café da Manhã",
  horario: "07:30",
  observacoes:
    "Pode misturar a aveia com a banana amassada e canela ou fazer panqueca proteica na frigideira.",
  itens: [
    {
      queries: ["Ovo, de galinha, inteiro, cozido/10minutos"],
      quantidade: 150,
      unidade: "g",
      medidaCaseira: "3 unidades médias",
      trocas: [
        {
          queries: ["Whey Protein Concentrado 80% (em pó)", "Whey Protein Isolado 90% (em pó)"],
          quantidade: 30,
          unidade: "g",
          medidaCaseira: "1 scoop",
        },
      ],
    },
    {
      queries: ["Pão, aveia, forma", "Pão, trigo, forma, integral"],
      quantidade: 75,
      unidade: "g",
      medidaCaseira: "3 fatias",
      trocas: [
        {
          queries: ["Cuscuz, de milho, cozido com sal"],
          quantidade: 150,
          unidade: "g",
          medidaCaseira: "6 colheres de sopa",
        },
      ],
    },
    {
      queries: ["Aveia, flocos, crua"],
      quantidade: 40,
      unidade: "g",
      medidaCaseira: "3 colheres de sopa",
      trocas: [
        {
          queries: ["Batata, doce, cozida"],
          quantidade: 150,
          unidade: "g",
          medidaCaseira: "1 unidade média",
        },
      ],
    },
    {
      queries: ["Banana, prata, crua", "Banana, nanica, crua"],
      quantidade: 90,
      unidade: "g",
      medidaCaseira: "1 unidade grande",
      trocas: [
        {
          queries: ["Maçã, Fuji, com casca, crua"],
          quantidade: 130,
          unidade: "g",
          medidaCaseira: "1 unidade média",
        },
      ],
    },
  ],
};

const DESJEJUM_GLICEMICO: MealBlueprint = {
  nome: "Desjejum / Café da Manhã",
  horario: "07:30",
  observacoes:
    "Iniciar a refeição pela proteína e fibras (ovos + linhaça/abacate) para atenuar o pico glicêmico pós-prandial.",
  itens: [
    {
      queries: ["Ovo, de galinha, inteiro, cozido/10minutos"],
      quantidade: 100,
      unidade: "g",
      medidaCaseira: "2 unidades médias",
      trocas: [
        {
          queries: ["Queijo, minas, frescal"],
          quantidade: 50,
          unidade: "g",
          medidaCaseira: "2 fatias médias",
        },
      ],
    },
    {
      queries: ["Abacate, cru"],
      quantidade: 70,
      unidade: "g",
      medidaCaseira: "2 colheres de sopa cheias",
      trocas: [
        {
          queries: ["Castanha-do-Brasil, crua"],
          quantidade: 15,
          unidade: "g",
          medidaCaseira: "3 unidades",
        },
      ],
    },
    {
      queries: ["Iogurte, natural, desnatado", "Iogurte, natural"],
      quantidade: 160,
      unidade: "ml",
      medidaCaseira: "1 pote individual",
      trocas: [
        {
          queries: ["Queijo, ricota"],
          quantidade: 60,
          unidade: "g",
          medidaCaseira: "2 fatias finas",
        },
      ],
    },
    {
      queries: ["Linhaça, semente"],
      quantidade: 15,
      unidade: "g",
      medidaCaseira: "1 colher de sopa",
      trocas: [
        {
          queries: ["Aveia, flocos, crua"],
          quantidade: 15,
          unidade: "g",
          medidaCaseira: "1 colher de sopa",
        },
      ],
    },
  ],
};

const ALMOCO_EMAGRECIMENTO: MealBlueprint = {
  nome: "Almoço",
  horario: "12:30",
  observacoes:
    "Iniciar sempre pela salada crua e legumes. Temperar com limão, ervas naturais e o azeite prescrito.",
  itens: [
    {
      queries: ["Frango, peito, sem pele, cozido"],
      quantidade: 120,
      unidade: "g",
      medidaCaseira: "1 filé médio grelhado",
      trocas: [
        {
          queries: ["Carne, bovina, patinho, sem gordura, grelhado"],
          quantidade: 110,
          unidade: "g",
          medidaCaseira: "1 bife médio",
        },
        {
          queries: ["Merluza, filé, assado", "Salmão, sem pele, fresco, grelhado"],
          quantidade: 140,
          unidade: "g",
          medidaCaseira: "1 filé médio",
        },
      ],
    },
    {
      queries: ["Arroz, integral, cozido", "Arroz, tipo 1, cozido"],
      quantidade: 80,
      unidade: "g",
      medidaCaseira: "3 colheres de sopa",
      trocas: [
        {
          queries: ["Batata, doce, cozida"],
          quantidade: 110,
          unidade: "g",
          medidaCaseira: "3 rodelas médias",
        },
        {
          queries: ["Batata, inglesa, cozida"],
          quantidade: 150,
          unidade: "g",
          medidaCaseira: "1 unidade média",
        },
      ],
    },
    {
      queries: ["Feijão, carioca, cozido", "Feijão, preto, cozido"],
      quantidade: 80,
      unidade: "g",
      medidaCaseira: "1 concha pequena",
      trocas: [
        {
          queries: ["Lentilha, cozida"],
          quantidade: 70,
          unidade: "g",
          medidaCaseira: "3 colheres de sopa",
        },
      ],
    },
    {
      queries: ["Brócolis, cozido"],
      quantidade: 90,
      unidade: "g",
      medidaCaseira: "4 floretes médios",
      trocas: [
        {
          queries: ["Abobrinha, italiana, refogada"],
          quantidade: 100,
          unidade: "g",
          medidaCaseira: "3 colheres de sopa",
        },
        {
          queries: ["Couve-flor, cozida"],
          quantidade: 100,
          unidade: "g",
          medidaCaseira: "4 floretes médios",
        },
      ],
    },
    {
      queries: ["Alface, crespa, crua", "Alface, lisa, crua"],
      quantidade: 50,
      unidade: "g",
      medidaCaseira: "1 prato de sobremesa cheio",
      trocas: [
        {
          queries: ["Rúcula, crua"],
          quantidade: 50,
          unidade: "g",
          medidaCaseira: "1 prato de sobremesa",
        },
      ],
    },
    {
      queries: ["Azeite, de oliva, extra virgem"],
      quantidade: 5,
      unidade: "ml",
      medidaCaseira: "1 colher de chá",
    },
  ],
};

const ALMOCO_HIPERTROFIA: MealBlueprint = {
  nome: "Almoço",
  horario: "12:30",
  observacoes:
    "Refeição principal de suporte anabólico. Manter boa hidratação entre as refeições.",
  itens: [
    {
      queries: ["Carne, bovina, patinho, sem gordura, grelhado"],
      quantidade: 160,
      unidade: "g",
      medidaCaseira: "1 bife grande ou 5 colheres de carne moída",
      trocas: [
        {
          queries: ["Frango, peito, sem pele, cozido"],
          quantidade: 180,
          unidade: "g",
          medidaCaseira: "1 filé grande",
        },
        {
          queries: ["Salmão, sem pele, fresco, grelhado"],
          quantidade: 160,
          unidade: "g",
          medidaCaseira: "1 posta média",
        },
      ],
    },
    {
      queries: ["Arroz, tipo 1, cozido", "Arroz, integral, cozido"],
      quantidade: 180,
      unidade: "g",
      medidaCaseira: "6 colheres de sopa cheias",
      trocas: [
        {
          queries: ["Mandioca, cozida"],
          quantidade: 180,
          unidade: "g",
          medidaCaseira: "2 pedaços médios",
        },
        {
          queries: ["Batata, doce, cozida"],
          quantidade: 240,
          unidade: "g",
          medidaCaseira: "2 unidades médias",
        },
      ],
    },
    {
      queries: ["Feijão, carioca, cozido", "Feijão, preto, cozido"],
      quantidade: 120,
      unidade: "g",
      medidaCaseira: "1 concha média cheia",
      trocas: [
        {
          queries: ["Lentilha, cozida"],
          quantidade: 100,
          unidade: "g",
          medidaCaseira: "4 colheres de sopa",
        },
      ],
    },
    {
      queries: ["Brócolis, cozido"],
      quantidade: 80,
      unidade: "g",
      medidaCaseira: "3 floretes médios",
      trocas: [
        {
          queries: ["Cenoura, cozida"],
          quantidade: 80,
          unidade: "g",
          medidaCaseira: "3 colheres de sopa",
        },
      ],
    },
    {
      queries: ["Azeite, de oliva, extra virgem"],
      quantidade: 10,
      unidade: "ml",
      medidaCaseira: "1 colher de sopa rasa",
    },
  ],
};

const ALMOCO_GLICEMICO: MealBlueprint = {
  nome: "Almoço",
  horario: "12:30",
  observacoes:
    "Ordem de ingestão recomendada: 1º folhas/legumes, 2º proteína + leguminosa, 3º carboidrato integral.",
  itens: [
    {
      queries: ["Salmão, sem pele, fresco, grelhado", "Frango, peito, sem pele, cozido"],
      quantidade: 130,
      unidade: "g",
      medidaCaseira: "1 filé médio grelhado",
      trocas: [
        {
          queries: ["Frango, peito, sem pele, cozido"],
          quantidade: 130,
          unidade: "g",
          medidaCaseira: "1 filé médio",
        },
        {
          queries: ["Merluza, filé, assado"],
          quantidade: 150,
          unidade: "g",
          medidaCaseira: "1 filé grande",
        },
      ],
    },
    {
      queries: ["Lentilha, cozida", "Feijão, preto, cozido"],
      quantidade: 90,
      unidade: "g",
      medidaCaseira: "4 colheres de sopa",
      trocas: [
        {
          queries: ["Feijão, preto, cozido"],
          quantidade: 100,
          unidade: "g",
          medidaCaseira: "1 concha pequena",
        },
      ],
    },
    {
      queries: ["Arroz, integral, cozido"],
      quantidade: 60,
      unidade: "g",
      medidaCaseira: "2 colheres de sopa",
      trocas: [
        {
          queries: ["Batata, doce, cozida"],
          quantidade: 80,
          unidade: "g",
          medidaCaseira: "2 rodelas médias",
        },
      ],
    },
    {
      queries: ["Abobrinha, italiana, refogada"],
      quantidade: 100,
      unidade: "g",
      medidaCaseira: "3 colheres de sopa",
      trocas: [
        {
          queries: ["Brócolis, cozido"],
          quantidade: 100,
          unidade: "g",
          medidaCaseira: "4 floretes médios",
        },
      ],
    },
    {
      queries: ["Rúcula, crua", "Alface, crespa, crua"],
      quantidade: 50,
      unidade: "g",
      medidaCaseira: "1 prato de sobremesa",
    },
    {
      queries: ["Tomate, com semente, cru"],
      quantidade: 80,
      unidade: "g",
      medidaCaseira: "4 fatias médias",
    },
    {
      queries: ["Azeite, de oliva, extra virgem"],
      quantidade: 8,
      unidade: "ml",
      medidaCaseira: "1 colher de sobremesa",
    },
  ],
};

const LANCHE_PROTEICO: MealBlueprint = {
  nome: "Lanche da Tarde",
  horario: "16:00",
  observacoes:
    "Misturar o whey no iogurte natural gelado com canela ou consumir a fruta separadamente para maior saciedade.",
  itens: [
    {
      queries: ["Iogurte, natural, desnatado", "Iogurte, natural"],
      quantidade: 170,
      unidade: "ml",
      medidaCaseira: "1 pote individual",
      trocas: [
        {
          queries: ["Queijo, ricota"],
          quantidade: 70,
          unidade: "g",
          medidaCaseira: "2 fatias médias",
        },
      ],
    },
    {
      queries: ["Whey Protein Isolado 90% (em pó)", "Whey Protein Concentrado 80% (em pó)"],
      quantidade: 25,
      unidade: "g",
      medidaCaseira: "1 scoop raso",
      trocas: [
        {
          queries: ["Ovo, de galinha, inteiro, cozido/10minutos"],
          quantidade: 100,
          unidade: "g",
          medidaCaseira: "2 unidades médias",
        },
      ],
    },
    {
      queries: ["Maçã, Fuji, com casca, crua"],
      quantidade: 130,
      unidade: "g",
      medidaCaseira: "1 unidade média",
      trocas: [
        {
          queries: ["Kiwi, cru"],
          quantidade: 100,
          unidade: "g",
          medidaCaseira: "1 unidade grande",
        },
      ],
    },
    {
      queries: ["Castanha-de-caju, torrada, salgada", "Castanha-do-Brasil, crua"],
      quantidade: 15,
      unidade: "g",
      medidaCaseira: "6 unidades",
      trocas: [
        {
          queries: ["Castanha-do-Brasil, crua"],
          quantidade: 12,
          unidade: "g",
          medidaCaseira: "2 unidades",
        },
      ],
    },
  ],
};

const LANCHE_PRE_TREINO: MealBlueprint = {
  nome: "Lanche da Tarde / Pré-Treino",
  horario: "16:30",
  observacoes:
    "Consumir de 45 a 60 minutos antes do treino para disponibilidade energética rápida sem desconforto gástrico.",
  itens: [
    {
      queries: ["Banana, prata, crua", "Banana, nanica, crua"],
      quantidade: 100,
      unidade: "g",
      medidaCaseira: "1 unidade grande",
      trocas: [
        {
          queries: ["Pão, trigo, forma, integral"],
          quantidade: 50,
          unidade: "g",
          medidaCaseira: "2 fatias",
        },
      ],
    },
    {
      queries: ["Aveia, flocos, crua"],
      quantidade: 30,
      unidade: "g",
      medidaCaseira: "2 colheres de sopa",
      trocas: [
        {
          queries: ["Cuscuz, de milho, cozido com sal"],
          quantidade: 90,
          unidade: "g",
          medidaCaseira: "3 colheres de sopa",
        },
      ],
    },
    {
      queries: ["Whey Protein Concentrado 80% (em pó)", "Whey Protein Isolado 90% (em pó)"],
      quantidade: 30,
      unidade: "g",
      medidaCaseira: "1 scoop cheio",
      trocas: [
        {
          queries: ["Iogurte, natural"],
          quantidade: 170,
          unidade: "ml",
          medidaCaseira: "1 pote individual",
        },
      ],
    },
  ],
};

const JANTAR_LEVE: MealBlueprint = {
  nome: "Jantar",
  horario: "20:00",
  observacoes:
    "Refeição leve de fácil digestão noturna. Evitar deitar nos primeiros 90 minutos após o jantar.",
  itens: [
    {
      queries: ["Merluza, filé, assado", "Frango, peito, sem pele, cozido"],
      quantidade: 140,
      unidade: "g",
      medidaCaseira: "1 filé médio assado ou grelhado",
      trocas: [
        {
          queries: ["Frango, peito, sem pele, cozido"],
          quantidade: 120,
          unidade: "g",
          medidaCaseira: "1 filé médio",
        },
        {
          queries: ["Ovo, de galinha, inteiro, cozido/10minutos"],
          quantidade: 150,
          unidade: "g",
          medidaCaseira: "3 unidades (omelete com ervas)",
        },
      ],
    },
    {
      queries: ["Abobrinha, italiana, refogada"],
      quantidade: 120,
      unidade: "g",
      medidaCaseira: "4 colheres de sopa",
      trocas: [
        {
          queries: ["Brócolis, cozido"],
          quantidade: 100,
          unidade: "g",
          medidaCaseira: "4 floretes médios",
        },
        {
          queries: ["Couve-flor, cozida"],
          quantidade: 120,
          unidade: "g",
          medidaCaseira: "5 floretes",
        },
      ],
    },
    {
      queries: ["Alface, crespa, crua", "Rúcula, crua"],
      quantidade: 50,
      unidade: "g",
      medidaCaseira: "1 prato de sobremesa",
    },
    {
      queries: ["Tomate, com semente, cru"],
      quantidade: 80,
      unidade: "g",
      medidaCaseira: "4 fatias médias",
    },
    {
      queries: ["Azeite, de oliva, extra virgem"],
      quantidade: 5,
      unidade: "ml",
      medidaCaseira: "1 colher de chá",
    },
  ],
};

const JANTAR_HIPERTROFIA: MealBlueprint = {
  nome: "Jantar",
  horario: "20:00",
  observacoes:
    "Refeição pós-treino/noturna voltada à recuperação muscular e reposição de glicogênio.",
  itens: [
    {
      queries: ["Frango, peito, sem pele, cozido"],
      quantidade: 160,
      unidade: "g",
      medidaCaseira: "1 filé grande grelhado",
      trocas: [
        {
          queries: ["Carne, bovina, patinho, sem gordura, grelhado"],
          quantidade: 150,
          unidade: "g",
          medidaCaseira: "1 bife grande",
        },
        {
          queries: ["Salmão, sem pele, fresco, grelhado"],
          quantidade: 150,
          unidade: "g",
          medidaCaseira: "1 posta média",
        },
      ],
    },
    {
      queries: ["Batata, doce, cozida"],
      quantidade: 200,
      unidade: "g",
      medidaCaseira: "1 unidade grande ou purê",
      trocas: [
        {
          queries: ["Arroz, tipo 1, cozido"],
          quantidade: 150,
          unidade: "g",
          medidaCaseira: "5 colheres de sopa",
        },
        {
          queries: ["Mandioca, cozida"],
          quantidade: 150,
          unidade: "g",
          medidaCaseira: "2 pedaços médios",
        },
      ],
    },
    {
      queries: ["Brócolis, cozido"],
      quantidade: 90,
      unidade: "g",
      medidaCaseira: "4 floretes médios",
      trocas: [
        {
          queries: ["Espinafre, Nova Zelândia, refogado"],
          quantidade: 80,
          unidade: "g",
          medidaCaseira: "3 colheres de sopa",
        },
      ],
    },
    {
      queries: ["Azeite, de oliva, extra virgem"],
      quantidade: 8,
      unidade: "ml",
      medidaCaseira: "1 colher de sobremesa",
    },
  ],
};

const SEED_SPECS: TemplateSeedSpec[] = [
  // DESJEJUM (3 modelos)
  {
    escopo: "REFEICAO",
    categoriaRefeicao: "DESJEJUM",
    titulo: "Café da Manhã — Emagrecimento Proteico",
    objetivoTag: "EMAGRECIMENTO",
    descricao:
      "Alta saciedade matinal com ovos, carboidrato integral controlado e fruta leve.",
    refeicao: DESJEJUM_EMAGRECIMENTO,
  },
  {
    escopo: "REFEICAO",
    categoriaRefeicao: "DESJEJUM",
    titulo: "Café da Manhã — Hipertrofia Energético",
    objetivoTag: "HIPERTROFIA",
    descricao:
      "Combinação densa em proteína e carboidratos complexos para sustentar ganho de massa.",
    refeicao: DESJEJUM_HIPERTROFIA,
  },
  {
    escopo: "REFEICAO",
    categoriaRefeicao: "DESJEJUM",
    titulo: "Café da Manhã — Controle Glicêmico",
    objetivoTag: "CONTROLE_GLICEMICO",
    descricao:
      "Baixa carga glicêmica com proteínas, gorduras boas (abacate) e fibras solúveis.",
    refeicao: DESJEJUM_GLICEMICO,
  },
  // ALMOÇO (3 modelos)
  {
    escopo: "REFEICAO",
    categoriaRefeicao: "ALMOCO",
    titulo: "Almoço — Emagrecimento Equilibrado",
    objetivoTag: "EMAGRECIMENTO",
    descricao:
      "Prato brasileiro equilibrado com proteína magra, porção controlada de arroz integral + feijão e vegetais.",
    refeicao: ALMOCO_EMAGRECIMENTO,
  },
  {
    escopo: "REFEICAO",
    categoriaRefeicao: "ALMOCO",
    titulo: "Almoço — Hipertrofia Massa Magra",
    objetivoTag: "HIPERTROFIA",
    descricao:
      "Aporte elevado de proteína animal e carboidrato complexo para recuperação e anabolismo.",
    refeicao: ALMOCO_HIPERTROFIA,
  },
  {
    escopo: "REFEICAO",
    categoriaRefeicao: "ALMOCO",
    titulo: "Almoço — Baixo Índice Glicêmico",
    objetivoTag: "CONTROLE_GLICEMICO",
    descricao:
      "Prioridade em fibras, peixe/proteína magra e leguminosas para resposta glicêmica estável.",
    refeicao: ALMOCO_GLICEMICO,
  },
  // LANCHE DA TARDE (2 modelos)
  {
    escopo: "REFEICAO",
    categoriaRefeicao: "LANCHE",
    titulo: "Lanche da Tarde — Prático Proteico",
    objetivoTag: "EMAGRECIMENTO",
    descricao:
      "Rápido para rotina corrida com iogurte, proteína de alto valor biológico, fruta e oleaginosas.",
    refeicao: LANCHE_PROTEICO,
  },
  {
    escopo: "REFEICAO",
    categoriaRefeicao: "LANCHE",
    titulo: "Lanche da Tarde — Pré-Treino",
    objetivoTag: "HIPERTROFIA",
    descricao:
      "Carboidrato de fácil absorção + proteína para performance e proteção muscular no treino.",
    refeicao: LANCHE_PRE_TREINO,
  },
  // JANTAR (2 modelos)
  {
    escopo: "REFEICAO",
    categoriaRefeicao: "JANTAR",
    titulo: "Jantar — Leve Metabólico",
    objetivoTag: "EMAGRECIMENTO",
    descricao:
      "Baixa densidade calórica noturna com proteína leve e vegetais de fácil digestão.",
    refeicao: JANTAR_LEVE,
  },
  {
    escopo: "REFEICAO",
    categoriaRefeicao: "JANTAR",
    titulo: "Jantar — Hipertrofia Noturno",
    objetivoTag: "HIPERTROFIA",
    descricao:
      "Combinação completa de proteína magra e batata-doce para recuperação noturna.",
    refeicao: JANTAR_HIPERTROFIA,
  },
  // PLANOS COMPLETOS (2 modelos)
  {
    escopo: "PLANO_COMPLETO",
    categoriaRefeicao: "GERAL",
    titulo: "Protocolo Emagrecimento Base",
    objetivoTag: "EMAGRECIMENTO",
    descricao:
      "Dia alimentar completo com 4 refeições balanceadas em déficit moderado, alta saciedade e trocas práticas.",
    refeicoes: [
      DESJEJUM_EMAGRECIMENTO,
      ALMOCO_EMAGRECIMENTO,
      LANCHE_PROTEICO,
      JANTAR_LEVE,
    ],
  },
  {
    escopo: "PLANO_COMPLETO",
    categoriaRefeicao: "GERAL",
    titulo: "Protocolo Hipertrofia Base",
    objetivoTag: "HIPERTROFIA",
    descricao:
      "Dia alimentar completo com 4 refeições hiperproteicas e aporte energético estruturado para ganho de massa.",
    refeicoes: [
      DESJEJUM_HIPERTROFIA,
      ALMOCO_HIPERTROFIA,
      LANCHE_PRE_TREINO,
      JANTAR_HIPERTROFIA,
    ],
  },
];

export function buildInitialSeedModels(
  alimentos: Alimento[],
  organizationId: string | null,
): Array<Partial<ModeloDieta>> {
  const { resolveMeal } = createTacoResolver(alimentos);

  return SEED_SPECS.map((spec) => {
    const conteudo: ModeloDietaConteudo =
      spec.escopo === "PLANO_COMPLETO"
        ? {
            refeicoes: (spec.refeicoes || []).map(resolveMeal),
          }
        : resolveMeal(spec.refeicao!);

    return {
      id: crypto.randomUUID(),
      organizationId,
      medicoId: null,
      escopo: spec.escopo,
      categoriaRefeicao: spec.categoriaRefeicao,
      titulo: spec.titulo,
      objetivoTag: spec.objetivoTag,
      descricao: spec.descricao,
      conteudoJson: JSON.stringify(conteudo),
      padraoSistema: true,
    };
  });
}
