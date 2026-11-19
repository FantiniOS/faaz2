/**
 * Utilitário central de classificação e adaptação semântica do Objetivo Clínico.
 * Garante linguagem, cores e indicadores 100% coerentes com a diretriz médica
 * (Hipertrofia, Emagrecimento ou Manutenção Metabólica).
 */

export type PerfilObjetivo = "HIPERTROFIA" | "EMAGRECIMENTO" | "MANUTENCAO";

export interface ConfigObjetivoClinico {
  perfil: PerfilObjetivo;
  rotuloCurto: string;
  subtituloHeader: string;
  mensagemMotivacional: string;
  mensagemTreino: string;
  mensagemPeso: string;
  accentColor: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
}

export interface AvaliacaoVariacaoPeso {
  tom: "positivo" | "atencao" | "neutro";
  sinalTexto: string;
  rotulo: string;
  corTexto: string;
  corFundo: string;
  corBorda: string;
}

function normalizarTexto(valor?: string | null): string {
  if (!valor) return "";
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Classifica `treatmentObjective` / `focoClinico` em um dos 3 perfis clínicos.
 */
export function classificarObjetivoClinico(
  objetivo?: string | null
): PerfilObjetivo {
  const norm = normalizarTexto(objetivo);
  if (!norm) return "MANUTENCAO";

  if (
    norm.includes("hipertrofia") ||
    norm.includes("ganho de massa") ||
    norm.includes("massa muscular") ||
    norm.includes("bulking") ||
    norm.includes("ganho muscular") ||
    norm.includes("ganhar massa")
  ) {
    return "HIPERTROFIA";
  }

  if (
    norm.includes("emagrecimento") ||
    norm.includes("perda de peso") ||
    norm.includes("emagrecer") ||
    norm.includes("deficit") ||
    norm.includes("definicao") ||
    norm.includes("reducao de gordura") ||
    norm.includes("reducao ponderal")
  ) {
    return "EMAGRECIMENTO";
  }

  return "MANUTENCAO";
}

/**
 * Retorna textos clínicos, rótulos e paleta visual coerentes com o objetivo.
 */
export function getConfigObjetivoClinico(
  objetivo?: string | null
): ConfigObjetivoClinico {
  const perfil = classificarObjetivoClinico(objetivo);

  if (perfil === "HIPERTROFIA") {
    return {
      perfil,
      rotuloCurto: "Hipertrofia",
      subtituloHeader: "Foco em ganho de massa magra e força",
      mensagemMotivacional:
        "Aporte proteico adequado, hidratação e constância no treino sustentam a síntese muscular.",
      mensagemTreino:
        "Treinos de força regulares estimulam o anabolismo e a evolução da composição corporal.",
      mensagemPeso:
        "Acompanhe a evolução ponderal junto às circunferências para garantir ganho de massa magra.",
      accentColor: "#0f766e",
      badgeBg: "#f0fdfa",
      badgeBorder: "#99f6e4",
      badgeText: "#0f766e",
    };
  }

  if (perfil === "EMAGRECIMENTO") {
    return {
      perfil,
      rotuloCurto: "Emagrecimento",
      subtituloHeader: "Foco em redução de gordura com preservação muscular",
      mensagemMotivacional:
        "Aderência ao plano alimentar, hidratação e rotina ativa promovem resultados sustentáveis.",
      mensagemTreino:
        "A prática regular preserva sua massa magra e potencializa a recomposição corporal.",
      mensagemPeso:
        "Observe a tendência ao longo das semanas em conjunto com as medidas de cintura e abdômen.",
      accentColor: "#059669",
      badgeBg: "#ecfdf5",
      badgeBorder: "#a7f3d0",
      badgeText: "#047857",
    };
  }

  return {
    perfil: "MANUTENCAO",
    rotuloCurto: "Manutenção",
    subtituloHeader: "Foco em equilíbrio metabólico e longevidade",
    mensagemMotivacional:
      "Consistência diária em hidratação, alimentação e movimento mantém seu metabolismo estável.",
    mensagemTreino:
      "Exercícios regulares fortalecem a saúde cardiovascular, a disposição e a longevidade.",
    mensagemPeso:
      "A estabilidade ponderal e a constância dos biomarcadores refletem bom equilíbrio clínico.",
    accentColor: "#0284c7",
    badgeBg: "#f0f9ff",
    badgeBorder: "#bae6fd",
    badgeText: "#0369a1",
  };
}

/**
 * Avalia variação de peso (`pesoAtual - pesoReferencia`) com semântica coerente ao objetivo:
 * - HIPERTROFIA: ganho = verde/positivo; queda = atenção/âmbar
 * - EMAGRECIMENTO: queda = verde/positivo; ganho = atenção/âmbar
 * - MANUTENCAO: estabilidade = verde/neutro
 */
export function avaliarVariacaoPeso(
  deltaKg: number,
  objetivo?: string | null
): AvaliacaoVariacaoPeso {
  const perfil = classificarObjetivoClinico(objetivo);
  const rounded = Math.round(deltaKg * 10) / 10;
  const absFormatted = Math.abs(rounded).toFixed(1).replace(".", ",");

  const sinalTexto =
    Math.abs(rounded) < 0.05
      ? "Estável"
      : `${rounded > 0 ? "+" : "-"}${absFormatted} kg`;

  const positivoStyle = {
    tom: "positivo" as const,
    corTexto: "#047857",
    corFundo: "#ecfdf5",
    corBorda: "#a7f3d0",
  };

  const atencaoStyle = {
    tom: "atencao" as const,
    corTexto: "#b45309",
    corFundo: "#fffbeb",
    corBorda: "#fde68a",
  };

  const neutroStyle = {
    tom: "neutro" as const,
    corTexto: "#475569",
    corFundo: "#f1f5f9",
    corBorda: "#cbd5e1",
  };

  if (perfil === "HIPERTROFIA") {
    if (rounded >= 0.1) {
      return { ...positivoStyle, sinalTexto, rotulo: "Evolução positiva" };
    }
    if (rounded <= -0.1) {
      return { ...atencaoStyle, sinalTexto, rotulo: "Atenção à queda" };
    }
    return { ...neutroStyle, sinalTexto: "Estável", rotulo: "Peso estável" };
  }

  if (perfil === "EMAGRECIMENTO") {
    if (rounded <= -0.1) {
      return { ...positivoStyle, sinalTexto, rotulo: "Evolução positiva" };
    }
    if (rounded >= 0.1) {
      return { ...atencaoStyle, sinalTexto, rotulo: "Atenção ao ganho" };
    }
    return { ...neutroStyle, sinalTexto: "Estável", rotulo: "Peso estável" };
  }

  // MANUTENCAO
  if (Math.abs(rounded) <= 1.0) {
    return {
      ...positivoStyle,
      sinalTexto: Math.abs(rounded) < 0.05 ? "Estável" : sinalTexto,
      rotulo: "Faixa estável",
    };
  }
  return { ...neutroStyle, sinalTexto, rotulo: "Variação registrada" };
}
