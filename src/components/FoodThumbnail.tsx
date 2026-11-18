"use client";

import React, { useState } from "react";

export interface FoodThumbnailProps {
  nome: string;
  categoria?: string | null;
  imageUrl?: string | null;
  className?: string;
}

export interface FoodVisual {
  emoji: string;
  bg: string;
  border: string;
}

/**
 * Dicionário inteligente de mapeamento baseado em Keywords/Regex no nome do alimento
 * com fallbacks elegantes por categoria e geral (Padrão TACO/TBCA).
 */
export function getFoodVisual(nome: string, categoria?: string | null): FoodVisual {
  const raw = (nome || "").toLowerCase();
  const n = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const c = (categoria || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Ovos (checado antes de galinha para evitar falso positivo em 'ovo de galinha')
  if (n.includes("ovo") || n.includes("omelete") || n.includes("clara") || n.includes("gema")) {
    return { emoji: "🥚", bg: "bg-amber-50/80", border: "border-amber-200/80" };
  }

  // 2. Frutas Específicas
  if (n.includes("banana")) {
    return { emoji: "🍌", bg: "bg-yellow-50/80", border: "border-yellow-200/80" };
  }
  if (n.includes("maca") && !n.includes("macarrao")) {
    return { emoji: "🍎", bg: "bg-red-50/80", border: "border-red-200/80" };
  }
  if (n.includes("laranja") || n.includes("tangerina") || n.includes("mexerica")) {
    return { emoji: "🍊", bg: "bg-orange-50/80", border: "border-orange-200/80" };
  }
  if (n.includes("limao")) {
    return { emoji: "🍋", bg: "bg-yellow-50/80", border: "border-yellow-200/80" };
  }
  if (n.includes("uva")) {
    return { emoji: "🍇", bg: "bg-purple-50/80", border: "border-purple-200/80" };
  }
  if (n.includes("morango")) {
    return { emoji: "🍓", bg: "bg-rose-50/80", border: "border-rose-200/80" };
  }
  if (n.includes("abacaxi")) {
    return { emoji: "🍍", bg: "bg-yellow-50/80", border: "border-yellow-200/80" };
  }
  if (n.includes("melancia")) {
    return { emoji: "🍉", bg: "bg-red-50/80", border: "border-red-200/80" };
  }
  if (n.includes("abacate") || n.includes("avocado")) {
    return { emoji: "🥑", bg: "bg-emerald-50/80", border: "border-emerald-200/80" };
  }
  if (n.includes("coco")) {
    return { emoji: "🥥", bg: "bg-amber-50/80", border: "border-amber-200/80" };
  }
  if (n.includes("pessego")) {
    return { emoji: "🍑", bg: "bg-orange-50/80", border: "border-orange-200/80" };
  }
  if (n.includes("manga") || n.includes("mamao") || n.includes("maracuja") || n.includes("kiwi")) {
    return { emoji: "🥭", bg: "bg-amber-50/80", border: "border-amber-200/80" };
  }

  // 3. Aves (Frango, Galinha, Peru, Chester)
  if (n.includes("frango") || n.includes("galinha") || n.includes("peru") || n.includes("chester") || n.includes("ave")) {
    return { emoji: "🍗", bg: "bg-amber-50/80", border: "border-amber-200/80" };
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
    return { emoji: "🥩", bg: "bg-rose-50/80", border: "border-rose-200/80" };
  }

  // 5. Arroz
  if (n.includes("arroz") || n.includes("risoto") || n.includes("baiao")) {
    return { emoji: "🍚", bg: "bg-amber-50/80", border: "border-amber-200/80" };
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
    return { emoji: "🍞", bg: "bg-amber-50/80", border: "border-amber-200/80" };
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
    return { emoji: "🐟", bg: "bg-sky-50/80", border: "border-sky-200/80" };
  }

  // 8. Massas, Batatas e Tubérculos
  if (n.includes("macarrao") || n.includes("espaguete") || n.includes("massa") || n.includes("lasanha")) {
    return { emoji: "🍝", bg: "bg-amber-50/80", border: "border-amber-200/80" };
  }
  if (n.includes("batata doce") || n.includes("batata-doce")) {
    return { emoji: "🍠", bg: "bg-purple-50/80", border: "border-purple-200/80" };
  }
  if (n.includes("batata") || n.includes("mandioca") || n.includes("aipim") || n.includes("pure")) {
    return { emoji: "🥔", bg: "bg-amber-50/80", border: "border-amber-200/80" };
  }
  if (n.includes("aveia") || n.includes("granola") || n.includes("cereal") || n.includes("mingau")) {
    return { emoji: "🥣", bg: "bg-amber-50/80", border: "border-amber-200/80" };
  }

  // 9. Leguminosas (Feijão, Lentilha, Grão-de-Bico)
  if (n.includes("feijao") || n.includes("lentilha") || n.includes("grao-de-bico") || n.includes("ervilha") || n.includes("soja")) {
    return { emoji: "🫘", bg: "bg-teal-50/80", border: "border-teal-200/80" };
  }

  // 10. Laticínios e Queijos
  if (n.includes("leite")) {
    return { emoji: "🥛", bg: "bg-sky-50/80", border: "border-sky-200/80" };
  }
  if (n.includes("queijo") || n.includes("mussarela") || n.includes("ricota") || n.includes("parmesao") || n.includes("cottage")) {
    return { emoji: "🧀", bg: "bg-amber-50/80", border: "border-amber-200/80" };
  }
  if (n.includes("iogurte") || n.includes("coalhada")) {
    return { emoji: "🍦", bg: "bg-sky-50/80", border: "border-sky-200/80" };
  }

  // 11. Vegetais, Saladas e Hortaliças Específicas
  if (n.includes("brocolis")) {
    return { emoji: "🥦", bg: "bg-emerald-50/80", border: "border-emerald-200/80" };
  }
  if (n.includes("cenoura")) {
    return { emoji: "🥕", bg: "bg-orange-50/80", border: "border-orange-200/80" };
  }
  if (n.includes("tomate")) {
    return { emoji: "🍅", bg: "bg-red-50/80", border: "border-red-200/80" };
  }
  if (
    n.includes("salada") ||
    n.includes("alface") ||
    n.includes("couve") ||
    n.includes("espinafre") ||
    n.includes("rucula") ||
    n.includes("repolho") ||
    n.includes("acelga")
  ) {
    return { emoji: "🥗", bg: "bg-emerald-50/80", border: "border-emerald-200/80" };
  }
  if (n.includes("pepino") || n.includes("abobrinha") || n.includes("chuchu")) {
    return { emoji: "🥒", bg: "bg-emerald-50/80", border: "border-emerald-200/80" };
  }

  // 12. Gorduras Saudáveis e Castanhas
  if (n.includes("azeite") || n.includes("oleo") || n.includes("oliva")) {
    return { emoji: "🫒", bg: "bg-emerald-50/80", border: "border-emerald-200/80" };
  }
  if (n.includes("castanha") || n.includes("amendoim") || n.includes("amendoa") || n.includes("noz") || n.includes("chia")) {
    return { emoji: "🥜", bg: "bg-orange-50/80", border: "border-orange-200/80" };
  }

  // 13. Bebidas e Suplementos
  if (n.includes("cafe")) {
    return { emoji: "☕", bg: "bg-stone-50/80", border: "border-stone-200/80" };
  }
  if (n.includes("cha")) {
    return { emoji: "🍵", bg: "bg-emerald-50/80", border: "border-emerald-200/80" };
  }
  if (n.includes("agua")) {
    return { emoji: "💧", bg: "bg-sky-50/80", border: "border-sky-200/80" };
  }
  if (n.includes("suco")) {
    return { emoji: "🧃", bg: "bg-orange-50/80", border: "border-orange-200/80" };
  }
  if (n.includes("whey") || n.includes("creatina") || n.includes("suplemento") || n.includes("albumina") || n.includes("psyllium")) {
    return { emoji: "⚡", bg: "bg-cyan-50/80", border: "border-cyan-200/80" };
  }

  // 14. Defaults por Categoria
  if (c.includes("fruta")) {
    return { emoji: "🍎", bg: "bg-red-50/80", border: "border-red-200/80" };
  }
  if (c.includes("vegetal") || c.includes("verdura") || c.includes("legume") || c.includes("hortali")) {
    return { emoji: "🥦", bg: "bg-emerald-50/80", border: "border-emerald-200/80" };
  }
  if (c.includes("carne") || c.includes("ave") || c.includes("bovino") || c.includes("suino")) {
    return { emoji: "🥩", bg: "bg-rose-50/80", border: "border-rose-200/80" };
  }
  if (c.includes("cereal") || c.includes("grao") || c.includes("panificacao")) {
    return { emoji: "🍚", bg: "bg-amber-50/80", border: "border-amber-200/80" };
  }

  // 15. Default Geral
  return { emoji: "🍽️", bg: "bg-slate-50", border: "border-slate-200/80" };
}

export function FoodThumbnail({
  nome,
  categoria,
  imageUrl,
  className = "",
}: FoodThumbnailProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const visual = getFoodVisual(nome, categoria);
  const hasError = Boolean(imageUrl && failedUrl === imageUrl);

  const baseClasses = `w-10 h-10 rounded-md border shadow-2xs flex-shrink-0 flex items-center justify-center select-none overflow-hidden ${className}`;

  if (imageUrl && !hasError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- WebP 100x100 pré-otimizado (~2 KB), servido estaticamente sem cota do Next/Vercel Image
      <img
        src={imageUrl}
        alt={nome}
        width={100}
        height={100}
        onError={() => setFailedUrl(imageUrl)}
        className={`${baseClasses} bg-white border-slate-200/80 object-cover`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div
      className={`${baseClasses} ${visual.bg} border-slate-200/80 text-2xl`}
      title={categoria ? `${nome} (${categoria})` : nome}
    >
      <span className="text-2xl leading-none select-none" role="img" aria-label={categoria || nome}>
        {visual.emoji}
      </span>
    </div>
  );
}

export default FoodThumbnail;
