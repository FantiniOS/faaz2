import {
  CheckinRefeicaoItem,
  CheckinRefeicaoStatus,
  ItemRefeicaoApi,
  RefeicaoApi,
  SubstituicaoPrescritaItem,
  UnidadeMedidaDieta,
  VariacaoDietaApi,
} from "../services/api";

export interface TrocaSelecionadaItem {
  itemRefeicaoId: string;
  alimentoOriginal: string;
  substituicaoId: string;
  alimentoSubstituto: string;
  quantidade: number;
  unidade: UnidadeMedidaDieta;
  medidaCaseira: string | null;
  thumbnailUrl: string | null;
}

export interface ItemEfetivoView {
  itemId: string;
  isTrocado: boolean;
  substituicaoAtiva: SubstituicaoPrescritaItem | null;
  nome: string;
  nomeOriginal: string;
  quantidade: number;
  unidade: UnidadeMedidaDieta;
  medidaCaseira: string | null;
  medidaOriginalTexto: string;
  medidaEfetivaTexto: string;
  thumbnailUrl: string | null;
  categoria: string | null;
  caloriasPorcao: number;
  proteinasPorcao: number;
  carboidratosPorcao: number;
  gordurasPorcao: number;
  totalSubstituicoes: number;
}

export interface ProgressoRefeicoesDia {
  obrigatoriasTotal: number;
  obrigatoriasConcluidas: number;
  opcionaisTotal: number;
  opcionaisConcluidas: number;
  totalConcluidas: number;
  percentualAdesao: number;
  pilarAtivo: boolean;
}

export interface ItemListaCompras {
  chave: string;
  nome: string;
  quantidadeTotal: number;
  unidade: UnidadeMedidaDieta;
  medidaCaseiraHint: string | null;
  ocorrencias: number;
  thumbnailUrl: string | null;
  categoria: string | null;
  origemTroca: boolean;
}

export function formatNumeroPtBr(valor: number): string {
  if (!Number.isFinite(valor)) return "0";
  const rounded = Math.round(valor * 10) / 10;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return rounded.toFixed(1).replace(".", ",");
}

export function normalizarUnidade(unidade?: string | null): UnidadeMedidaDieta {
  const u = (unidade || "g").trim().toLowerCase();
  if (u === "ml") return "ml";
  if (u === "un" || u === "und" || u === "unidade" || u === "unidades") {
    return "un";
  }
  return "g";
}

/**
 * Formata medida caseira + quantidade/unidade no padrão do Guia Interativo:
 * Ex.: "2 Colheres de sopa cheias · 40 g" ou, sem medida caseira, "40 g".
 */
export function formatQuantidadeMedida(
  quantidade?: number | null,
  unidade?: string | null,
  medidaCaseira?: string | null
): string {
  const qtd = Number(quantidade) || 0;
  const un = normalizarUnidade(unidade);
  const qtdTexto = `${formatNumeroPtBr(qtd)} ${un}`;
  const caseira = (medidaCaseira || "").trim();
  if (caseira.length > 0) {
    return `${caseira} · ${qtdTexto}`;
  }
  return qtdTexto;
}

/**
 * Converte horário livre ("07:45", "12:00", "7h30") em minutos a partir de 00:00.
 */
export function parseHorarioMinutos(horario?: string | null): number {
  if (!horario) return 24 * 60 + 59;
  const match = horario.match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (!match) return 24 * 60 + 59;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 24 * 60 + 59;
  return h * 60 + m;
}

export function formatHorarioCurto(horario?: string | null): string {
  if (!horario) return "";
  const match = horario.match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  return horario.trim();
}

/**
 * Ordena refeições cronologicamente pelo horário (com `ordem` como desempate).
 */
export function ordenarRefeicoesPorHorario(refeicoes: RefeicaoApi[]): RefeicaoApi[] {
  return [...refeicoes].sort((a, b) => {
    const minA = parseHorarioMinutos(a.horario);
    const minB = parseHorarioMinutos(b.horario);
    if (minA !== minB) return minA - minB;
    return (Number(a.ordem) || 0) - (Number(b.ordem) || 0);
  });
}

/**
 * Verifica se um status de check-in conta como 100% aderente.
 * Tanto SEGUI quanto FIZ_TROCA contam como 100% aderente.
 */
export function isStatusAderente(status?: CheckinRefeicaoStatus | null): boolean {
  return status === "SEGUI" || status === "FIZ_TROCA";
}

/**
 * Calcula o progresso diário de refeições:
 * - SEGUI e FIZ_TROCA contam como 100% aderentes.
 * - Refeições com opcional === true contam como bônus se concluídas e NÃO penalizam o denominador.
 */
export function calcularProgressoRefeicoesDia(
  refeicoes: RefeicaoApi[],
  checkinsPorRefeicao: Record<string, CheckinRefeicaoItem>
): ProgressoRefeicoesDia {
  if (!refeicoes.length) {
    return {
      obrigatoriasTotal: 0,
      obrigatoriasConcluidas: 0,
      opcionaisTotal: 0,
      opcionaisConcluidas: 0,
      totalConcluidas: 0,
      percentualAdesao: 0,
      pilarAtivo: false,
    };
  }

  let obrigatoriasTotal = 0;
  let obrigatoriasConcluidas = 0;
  let opcionaisTotal = 0;
  let opcionaisConcluidas = 0;

  for (const ref of refeicoes) {
    const concluida = isStatusAderente(checkinsPorRefeicao[ref.id]?.status);
    if (ref.opcional) {
      opcionaisTotal += 1;
      if (concluida) opcionaisConcluidas += 1;
    } else {
      obrigatoriasTotal += 1;
      if (concluida) obrigatoriasConcluidas += 1;
    }
  }

  const totalConcluidas = obrigatoriasConcluidas + opcionaisConcluidas;
  const denominador =
    obrigatoriasTotal > 0 ? obrigatoriasTotal : opcionaisTotal;
  const percentualAdesao =
    denominador > 0
      ? Math.min(100, Math.round((totalConcluidas / denominador) * 100))
      : 0;

  return {
    obrigatoriasTotal,
    obrigatoriasConcluidas,
    opcionaisTotal,
    opcionaisConcluidas,
    totalConcluidas,
    percentualAdesao,
    pilarAtivo: totalConcluidas > 0,
  };
}

/**
 * Seleciona automaticamente a refeição mais próxima do horário atual do dispositivo (Modo "Agora").
 */
export function selecionarRefeicaoMaisProximaAgora(
  refeicoes: RefeicaoApi[],
  agora: Date = new Date()
): RefeicaoApi | null {
  if (!refeicoes.length) return null;
  const ordenadas = ordenarRefeicoesPorHorario(refeicoes);
  const minAgora = agora.getHours() * 60 + agora.getMinutes();

  const comHorario = ordenadas.filter((r) => parseHorarioMinutos(r.horario) < 24 * 60);
  if (comHorario.length === 0) {
    return ordenadas[0];
  }

  let melhor = comHorario[0];
  let menorDistancia = Math.abs(parseHorarioMinutos(melhor.horario) - minAgora);

  for (let i = 1; i < comHorario.length; i++) {
    const candidata = comHorario[i];
    const minCand = parseHorarioMinutos(candidata.horario);
    const dist = Math.abs(minCand - minAgora);
    // Em caso de empate exato, prefere a próxima futura
    if (
      dist < menorDistancia ||
      (dist === menorDistancia && minCand >= minAgora)
    ) {
      melhor = candidata;
      menorDistancia = dist;
    }
  }

  return melhor;
}

/**
 * Seleciona a "Próxima Refeição" para o atalho da HomeScreen:
 * prioriza a próxima não concluída perto/após o horário atual, ou a primeira pendente.
 */
export function selecionarProximaRefeicaoHome(
  refeicoes: RefeicaoApi[],
  checkinsPorRefeicao: Record<string, CheckinRefeicaoItem>,
  agora: Date = new Date()
): RefeicaoApi | null {
  if (!refeicoes.length) return null;
  const ordenadas = ordenarRefeicoesPorHorario(refeicoes);
  const minAgora = agora.getHours() * 60 + agora.getMinutes();

  const proximaPendente = ordenadas.find((r) => {
    const status = checkinsPorRefeicao[r.id]?.status;
    return !isStatusAderente(status) && parseHorarioMinutos(r.horario) >= minAgora - 60;
  });
  if (proximaPendente) return proximaPendente;

  const qualquerPendente = ordenadas.find(
    (r) => !isStatusAderente(checkinsPorRefeicao[r.id]?.status)
  );
  if (qualquerPendente) return qualquerPendente;

  return selecionarRefeicaoMaisProximaAgora(ordenadas, agora);
}

/**
 * Calcula macros da porção de um alimento original caso o backend não tenha enviado pré-calculado.
 */
function calcularMacroPorcao(
  valorPorcao: number | null | undefined,
  valor100g: number | null | undefined,
  quantidade: number
): number {
  if (typeof valorPorcao === "number" && Number.isFinite(valorPorcao)) {
    return valorPorcao;
  }
  const base100 = Number(valor100g) || 0;
  if (base100 <= 0 || quantidade <= 0) return 0;
  return (base100 * quantidade) / 100;
}

/**
 * Resolve o alimento efetivo exibido para um item (considerando troca 1:N selecionada hoje).
 */
export function getItemEfetivo(
  item: ItemRefeicaoApi,
  trocasSelecionadas: Record<string, string>
): ItemEfetivoView {
  const alim = item.alimento || {};
  const nomeOriginal = (alim.nome || "Alimento prescrito").trim();
  const qtdOriginal = Number(item.quantidadeGramas) || 0;
  const unOriginal = normalizarUnidade(item.unidade);
  const medidaOriginal = item.medidaCaseira?.trim() || null;
  const medidaOriginalTexto = formatQuantidadeMedida(
    qtdOriginal,
    unOriginal,
    medidaOriginal
  );

  const calOrig = Math.round(
    calcularMacroPorcao(alim.caloriasPorcao, alim.calorias, qtdOriginal)
  );
  const protOrig = Number(
    calcularMacroPorcao(alim.proteinasPorcao, alim.proteinas, qtdOriginal).toFixed(1)
  );
  const carbOrig = Number(
    calcularMacroPorcao(alim.carboidratosPorcao, alim.carboidratos, qtdOriginal).toFixed(1)
  );
  const gordOrig = Number(
    calcularMacroPorcao(alim.gordurasPorcao, alim.gorduras, qtdOriginal).toFixed(1)
  );

  const listaSubs = Array.isArray(item.substituicoes) ? item.substituicoes : [];
  const subIdAtiva = trocasSelecionadas[item.id];
  const subAtiva = subIdAtiva
    ? listaSubs.find((s) => s.id === subIdAtiva) || null
    : null;

  if (subAtiva) {
    const unSub = normalizarUnidade(subAtiva.unidade);
    const qtdSub = Number(subAtiva.quantidade) || 0;
    const medSub = subAtiva.medidaCaseira?.trim() || null;
    return {
      itemId: item.id,
      isTrocado: true,
      substituicaoAtiva: subAtiva,
      nome: subAtiva.nomeExibicao,
      nomeOriginal,
      quantidade: qtdSub,
      unidade: unSub,
      medidaCaseira: medSub,
      medidaOriginalTexto,
      medidaEfetivaTexto: formatQuantidadeMedida(qtdSub, unSub, medSub),
      thumbnailUrl: subAtiva.thumbnailUrl ?? alim.thumbnailUrl ?? null,
      categoria: subAtiva.categoria ?? alim.categoria ?? null,
      caloriasPorcao:
        typeof subAtiva.caloriasPorcao === "number"
          ? Math.round(subAtiva.caloriasPorcao)
          : calOrig,
      proteinasPorcao:
        typeof subAtiva.proteinasPorcao === "number"
          ? Number(subAtiva.proteinasPorcao.toFixed(1))
          : protOrig,
      carboidratosPorcao:
        typeof subAtiva.carboidratosPorcao === "number"
          ? Number(subAtiva.carboidratosPorcao.toFixed(1))
          : carbOrig,
      gordurasPorcao:
        typeof subAtiva.gordurasPorcao === "number"
          ? Number(subAtiva.gordurasPorcao.toFixed(1))
          : gordOrig,
      totalSubstituicoes: listaSubs.length,
    };
  }

  return {
    itemId: item.id,
    isTrocado: false,
    substituicaoAtiva: null,
    nome: nomeOriginal,
    nomeOriginal,
    quantidade: qtdOriginal,
    unidade: unOriginal,
    medidaCaseira: medidaOriginal,
    medidaOriginalTexto,
    medidaEfetivaTexto: medidaOriginalTexto,
    thumbnailUrl: alim.thumbnailUrl ?? null,
    categoria: alim.categoria ?? null,
    caloriasPorcao: calOrig,
    proteinasPorcao: protOrig,
    carboidratosPorcao: carbOrig,
    gordurasPorcao: gordOrig,
    totalSubstituicoes: listaSubs.length,
  };
}

/**
 * Calcula o resumo nutricional efetivo de uma refeição (respeitando trocas aplicadas).
 */
export function calcularTotaisEfetivosRefeicao(
  refeicao: RefeicaoApi,
  trocasSelecionadas: Record<string, string>
): {
  calorias: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
} {
  const itens = Array.isArray(refeicao.itens) ? refeicao.itens : [];
  if (itens.length === 0) {
    return {
      calorias: Math.round(Number(refeicao.totais?.calorias ?? refeicao.calorias) || 0),
      proteinas: Number((Number(refeicao.totais?.proteinas) || 0).toFixed(1)),
      carboidratos: Number((Number(refeicao.totais?.carboidratos) || 0).toFixed(1)),
      gorduras: Number((Number(refeicao.totais?.gorduras) || 0).toFixed(1)),
    };
  }

  let calorias = 0;
  let proteinas = 0;
  let carboidratos = 0;
  let gorduras = 0;

  for (const item of itens) {
    const eff = getItemEfetivo(item, trocasSelecionadas);
    calorias += eff.caloriasPorcao;
    proteinas += eff.proteinasPorcao;
    carboidratos += eff.carboidratosPorcao;
    gorduras += eff.gordurasPorcao;
  }

  return {
    calorias: Math.round(calorias),
    proteinas: Math.round(proteinas),
    carboidratos: Math.round(carboidratos),
    gorduras: Math.round(gorduras),
  };
}

/**
 * Extrai o mapa { [itemRefeicaoId]: substituicaoId } a partir dos check-ins retornados pelo backend.
 */
export function extrairTrocasDosCheckins(
  checkins: CheckinRefeicaoItem[]
): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const checkin of checkins) {
    const raw = checkin.trocas;
    if (!raw) continue;
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (entry && typeof entry === "object") {
          const obj = entry as Record<string, unknown>;
          const itemId =
            typeof obj.itemRefeicaoId === "string" ? obj.itemRefeicaoId : null;
          const subId =
            typeof obj.substituicaoId === "string" ? obj.substituicaoId : null;
          if (itemId && subId) {
            mapa[itemId] = subId;
          }
        }
      }
    } else if (typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string" && v.trim()) {
          mapa[k] = v.trim();
        } else if (v && typeof v === "object") {
          const nested = v as Record<string, unknown>;
          if (typeof nested.substituicaoId === "string") {
            mapa[k] = nested.substituicaoId;
          }
        }
      }
    }
  }
  return mapa;
}

/**
 * Monta o array estruturado de trocas de uma refeição para enviar em POST /api/checkins/refeicoes.
 */
export function montarTrocasPayloadRefeicao(
  refeicao: RefeicaoApi | undefined | null,
  trocasSelecionadas: Record<string, string>
): TrocaSelecionadaItem[] {
  if (!refeicao || !Array.isArray(refeicao.itens)) return [];
  const lista: TrocaSelecionadaItem[] = [];

  for (const item of refeicao.itens) {
    const eff = getItemEfetivo(item, trocasSelecionadas);
    if (eff.isTrocado && eff.substituicaoAtiva) {
      lista.push({
        itemRefeicaoId: item.id,
        alimentoOriginal: eff.nomeOriginal,
        substituicaoId: eff.substituicaoAtiva.id,
        alimentoSubstituto: eff.nome,
        quantidade: eff.quantidade,
        unidade: eff.unidade,
        medidaCaseira: eff.medidaCaseira,
        thumbnailUrl: eff.thumbnailUrl,
      });
    }
  }

  return lista;
}

function normalizarChaveAlimento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Consolida automaticamente todos os itens da variação selecionada para a aba Compras,
 * refletindo as trocas escolhidas pelo paciente e somando quantidades do mesmo alimento/unidade.
 */
export function consolidarListaCompras(
  variacao: VariacaoDietaApi | null | undefined,
  trocasSelecionadas: Record<string, string>
): ItemListaCompras[] {
  if (!variacao || !Array.isArray(variacao.refeicoes)) return [];

  const agrupado = new Map<string, ItemListaCompras>();

  for (const ref of variacao.refeicoes) {
    const itens = Array.isArray(ref.itens) ? ref.itens : [];
    for (const item of itens) {
      const eff = getItemEfetivo(item, trocasSelecionadas);
      const chave = `${normalizarChaveAlimento(eff.nome)}|${eff.unidade}`;
      const existente = agrupado.get(chave);

      if (existente) {
        existente.quantidadeTotal =
          Math.round((existente.quantidadeTotal + eff.quantidade) * 10) / 10;
        existente.ocorrencias += 1;
        existente.medidaCaseiraHint = null; // Várias refeições somadas: exibe total consolidado
        if (eff.isTrocado) existente.origemTroca = true;
        if (!existente.thumbnailUrl && eff.thumbnailUrl) {
          existente.thumbnailUrl = eff.thumbnailUrl;
        }
      } else {
        agrupado.set(chave, {
          chave,
          nome: eff.nome,
          quantidadeTotal: eff.quantidade,
          unidade: eff.unidade,
          medidaCaseiraHint: eff.medidaCaseira,
          ocorrencias: 1,
          thumbnailUrl: eff.thumbnailUrl,
          categoria: eff.categoria,
          origemTroca: eff.isTrocado,
        });
      }
    }
  }

  return Array.from(agrupado.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR")
  );
}

/**
 * Gera texto formatado pronto para compartilhar via WhatsApp / Share nativo.
 */
export function gerarTextoCompartilhamentoCompras(
  tituloPlano: string,
  nomeVariacao: string | null | undefined,
  itens: ItemListaCompras[],
  marcados: Record<string, boolean>
): string {
  const cabecalho = nomeVariacao
    ? `Lista de Compras — ${tituloPlano} (${nomeVariacao})`
    : `Lista de Compras — ${tituloPlano}`;

  const pendentes = itens.filter((i) => !marcados[i.chave]);
  const noCarrinho = itens.filter((i) => Boolean(marcados[i.chave]));

  const linhas: string[] = [cabecalho, ""];

  if (pendentes.length > 0) {
    for (const item of pendentes) {
      const qtd = `${formatNumeroPtBr(item.quantidadeTotal)} ${item.unidade}`;
      const extra =
        item.ocorrencias === 1 && item.medidaCaseiraHint
          ? ` (${item.medidaCaseiraHint})`
          : item.ocorrencias > 1
            ? ` (${item.ocorrencias} porções/dia)`
            : "";
      linhas.push(`• ${item.nome} — ${qtd}${extra}`);
    }
  }

  if (noCarrinho.length > 0) {
    if (pendentes.length > 0) linhas.push("");
    linhas.push("Já separados:");
    for (const item of noCarrinho) {
      const qtd = `${formatNumeroPtBr(item.quantidadeTotal)} ${item.unidade}`;
      linhas.push(`✓ ${item.nome} — ${qtd}`);
    }
  }

  linhas.push("", "Clínica FAAZ • Guia da Dieta");
  return linhas.join("\n");
}
