/**
 * foodVisual.ts - Mapeamento inteligente de alimentos para emojis e estilos no React Native
 * Baseado em keywords e regex no nome do alimento (Padrão TACO/TBCA)
 */

export interface FoodVisualStyle {
  emoji: string;
  bgColor: string;
  borderColor: string;
}

export function getFoodVisual(nome: string, categoria?: string | null): FoodVisualStyle {
  const raw = (nome || "").toLowerCase();
  const n = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const c = (categoria || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Ovos (checado antes de galinha para evitar falso positivo em 'ovo de galinha')
  if (n.includes("ovo") || n.includes("omelete") || n.includes("clara") || n.includes("gema")) {
    return { emoji: "🥚", bgColor: "#fffbeb", borderColor: "#fde68a" };
  }

  // 2. Frutas Específicas
  if (n.includes("banana")) {
    return { emoji: "🍌", bgColor: "#fefce8", borderColor: "#fef08a" };
  }
  if (n.includes("maca") && !n.includes("macarrao")) {
    return { emoji: "🍎", bgColor: "#fef2f2", borderColor: "#fecaca" };
  }
  if (n.includes("laranja") || n.includes("tangerina") || n.includes("mexerica")) {
    return { emoji: "🍊", bgColor: "#fff7ed", borderColor: "#fed7aa" };
  }
  if (n.includes("limao")) {
    return { emoji: "🍋", bgColor: "#fefce8", borderColor: "#fef08a" };
  }
  if (n.includes("uva")) {
    return { emoji: "🍇", bgColor: "#faf5ff", borderColor: "#e9d5ff" };
  }
  if (n.includes("morango")) {
    return { emoji: "🍓", bgColor: "#fff1f2", borderColor: "#fecdd3" };
  }
  if (n.includes("abacaxi")) {
    return { emoji: "🍍", bgColor: "#fefce8", borderColor: "#fef08a" };
  }
  if (n.includes("melancia")) {
    return { emoji: "🍉", bgColor: "#fef2f2", borderColor: "#fecaca" };
  }
  if (n.includes("abacate") || n.includes("avocado")) {
    return { emoji: "🥑", bgColor: "#ecfdf5", borderColor: "#a7f3d0" };
  }
  if (n.includes("coco")) {
    return { emoji: "🥥", bgColor: "#fffbeb", borderColor: "#fde68a" };
  }
  if (n.includes("pessego")) {
    return { emoji: "🍑", bgColor: "#fff7ed", borderColor: "#fed7aa" };
  }
  if (n.includes("manga") || n.includes("mamao") || n.includes("maracuja") || n.includes("kiwi")) {
    return { emoji: "🥭", bgColor: "#fffbeb", borderColor: "#fde68a" };
  }

  // 3. Aves (Frango, Galinha, Peru, Chester)
  if (n.includes("frango") || n.includes("galinha") || n.includes("peru") || n.includes("chester") || n.includes("ave")) {
    return { emoji: "🍗", bgColor: "#fffbeb", borderColor: "#fde68a" };
  }

  // 4. Carnes Bovinas e Suínas (Carne, Patinho, Alcatra, Filé, Picanha, Músculo...)
  if (
    n.includes("carne") ||
    n.includes("patinho") ||
    n.includes("alcatra") ||
    n.includes("file") ||
    n.includes("picanha") ||
    n.includes("bife") ||
    n.includes("musculo") ||
    n.includes("contrafile") ||
    n.includes("maminha") ||
    n.includes("lagarto") ||
    n.includes("costela") ||
    n.includes("bovino") ||
    n.includes("suino") ||
    n.includes("porco") ||
    n.includes("lombo") ||
    n.includes("bacon") ||
    n.includes("carne-seca")
  ) {
    return { emoji: "🥩", bgColor: "#fff1f2", borderColor: "#fecdd3" };
  }

  // 5. Arroz
  if (n.includes("arroz") || n.includes("risoto") || n.includes("baiao")) {
    return { emoji: "🍚", bgColor: "#fffbeb", borderColor: "#fde68a" };
  }

  // 6. Pães, Torradas e Panificação
  if (
    n.includes("pao") ||
    raw.includes("pão") ||
    n.includes("torrada") ||
    n.includes("bisnaga") ||
    n.includes("croissant") ||
    n.includes("baguete")
  ) {
    return { emoji: "🍞", bgColor: "#fffbeb", borderColor: "#fde68a" };
  }

  // 7. Pescados e Frutos do Mar
  if (
    n.includes("peixe") ||
    n.includes("salmao") ||
    n.includes("atum") ||
    n.includes("tilapia") ||
    n.includes("sardinha") ||
    n.includes("bacalhau") ||
    n.includes("pescado") ||
    n.includes("camarao")
  ) {
    return { emoji: "🐟", bgColor: "#f0f9ff", borderColor: "#bae6fd" };
  }

  // 8. Massas, Batatas e Tubérculos
  if (n.includes("macarrao") || n.includes("espaguete") || n.includes("massa") || n.includes("lasanha")) {
    return { emoji: "🍝", bgColor: "#fffbeb", borderColor: "#fde68a" };
  }
  if (n.includes("batata doce") || n.includes("batata-doce")) {
    return { emoji: "🍠", bgColor: "#faf5ff", borderColor: "#e9d5ff" };
  }
  if (n.includes("batata") || n.includes("mandioca") || n.includes("aipim") || n.includes("pure")) {
    return { emoji: "🥔", bgColor: "#fffbeb", borderColor: "#fde68a" };
  }
  if (n.includes("aveia") || n.includes("granola") || n.includes("cereal") || n.includes("mingau")) {
    return { emoji: "🥣", bgColor: "#fffbeb", borderColor: "#fde68a" };
  }

  // 9. Leguminosas (Feijão, Lentilha, Grão-de-Bico)
  if (n.includes("feijao") || n.includes("lentilha") || n.includes("grao-de-bico") || n.includes("ervilha") || n.includes("soja")) {
    return { emoji: "🫘", bgColor: "#f0fdfa", borderColor: "#99f6e4" };
  }

  // 10. Laticínios e Queijos
  if (n.includes("leite")) {
    return { emoji: "🥛", bgColor: "#f0f9ff", borderColor: "#bae6fd" };
  }
  if (n.includes("queijo") || n.includes("mussarela") || n.includes("ricota") || n.includes("parmesao") || n.includes("cottage")) {
    return { emoji: "🧀", bgColor: "#fffbeb", borderColor: "#fde68a" };
  }
  if (n.includes("iogurte") || n.includes("coalhada")) {
    return { emoji: "🍦", bgColor: "#f0f9ff", borderColor: "#bae6fd" };
  }

  // 11. Vegetais, Saladas e Hortaliças
  if (n.includes("brocolis")) {
    return { emoji: "🥦", bgColor: "#ecfdf5", borderColor: "#a7f3d0" };
  }
  if (n.includes("cenoura")) {
    return { emoji: "🥕", bgColor: "#fff7ed", borderColor: "#fed7aa" };
  }
  if (n.includes("tomate")) {
    return { emoji: "🍅", bgColor: "#fef2f2", borderColor: "#fecaca" };
  }
  if (
    n.includes("salada") ||
    n.includes("alface") ||
    n.includes("couve") ||
    n.includes("espinafre") ||
    n.includes("rucula") ||
    n.includes("repolho")
  ) {
    return { emoji: "🥗", bgColor: "#ecfdf5", borderColor: "#a7f3d0" };
  }
  if (n.includes("pepino") || n.includes("abobrinha") || n.includes("chuchu")) {
    return { emoji: "🥒", bgColor: "#ecfdf5", borderColor: "#a7f3d0" };
  }

  // 12. Gorduras Saudáveis e Castanhas
  if (n.includes("azeite") || n.includes("oleo") || n.includes("oliva")) {
    return { emoji: "🫒", bgColor: "#ecfdf5", borderColor: "#a7f3d0" };
  }
  if (n.includes("castanha") || n.includes("amendoim") || n.includes("amendoa") || n.includes("noz") || n.includes("chia")) {
    return { emoji: "🥜", bgColor: "#fff7ed", borderColor: "#fed7aa" };
  }

  // 13. Bebidas e Suplementos
  if (n.includes("cafe")) {
    return { emoji: "☕", bgColor: "#fafaf9", borderColor: "#e7e5e4" };
  }
  if (n.includes("cha")) {
    return { emoji: "🍵", bgColor: "#ecfdf5", borderColor: "#a7f3d0" };
  }
  if (n.includes("agua")) {
    return { emoji: "💧", bgColor: "#f0f9ff", borderColor: "#bae6fd" };
  }
  if (n.includes("suco")) {
    return { emoji: "🧃", bgColor: "#fff7ed", borderColor: "#fed7aa" };
  }
  if (n.includes("whey") || n.includes("creatina") || n.includes("suplemento") || n.includes("albumina") || n.includes("psyllium")) {
    return { emoji: "⚡", bgColor: "#ecfeff", borderColor: "#a5f3fc" };
  }

  // 14. Defaults por Categoria
  if (c.includes("fruta")) {
    return { emoji: "🍎", bgColor: "#fef2f2", borderColor: "#fecaca" };
  }
  if (c.includes("vegetal") || c.includes("verdura") || c.includes("legume") || c.includes("hortali")) {
    return { emoji: "🥦", bgColor: "#ecfdf5", borderColor: "#a7f3d0" };
  }
  if (c.includes("carne") || c.includes("ave") || c.includes("bovino") || c.includes("suino")) {
    return { emoji: "🥩", bgColor: "#fff1f2", borderColor: "#fecdd3" };
  }
  if (c.includes("cereal") || c.includes("grao") || c.includes("panificacao")) {
    return { emoji: "🍚", bgColor: "#fffbeb", borderColor: "#fde68a" };
  }

  // 15. Default Geral
  return { emoji: "🍽️", bgColor: "#f8fafc", borderColor: "#e2e8f0" };
}
